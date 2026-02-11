import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../database/db.connection';
import {
  permissions,
  rolePermissions,
  roles,
  teamMembers,
} from '../../../database/schema';
import { AuditWriteService } from '../../audit/audit-write.service';

export interface CreateRoleDto {
  name: string;
  description?: string;
  ids_permissions: number[]; // List of permission IDs to assign
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  ids_permissions?: number[];
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly auditWriteService: AuditWriteService) {}

  /**
   * Get all roles for a team
   */
  async getTeamRoles(teamId: number) {
    return db.query.roles.findMany({
      where: eq(roles.teamId, teamId),
      with: {
        permissions: {
          with: {
            permission: true,
          },
        },
      },
    });
  }

  /**
   * Get a specific role with its permissions
   */
  async getRole(roleId: number, teamId: number) {
    const role = await db.query.roles.findFirst({
      where: and(eq(roles.id, roleId), eq(roles.teamId, teamId)),
      with: {
        permissions: {
          with: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found in team ${teamId}`);
    }

    return role;
  }

  /**
   * Create a new custom role
   */
  async createRole(teamId: number, dto: CreateRoleDto, userId?: number) {
    // Check for duplicate name in team
    const existing = await db.query.roles.findFirst({
      where: and(eq(roles.teamId, teamId), eq(roles.name, dto.name)),
    });

    if (existing) {
      throw new ConflictException(
        `Role '${dto.name}' already exists in this team`,
      );
    }

    // Create role
    const [newRole] = await db
      .insert(roles)
      .values({
        teamId,
        name: dto.name,
        description: dto.description,
        isSystem: false,
      })
      .returning();

    // Assign permissions
    if (dto.ids_permissions && dto.ids_permissions.length > 0) {
      await this.assignPermissions(newRole.id, dto.ids_permissions);
    }

    const created = await this.getRole(newRole.id, teamId);

    if (userId) {
      await this.auditWriteService.logCustomRoleCreated({
        userId,
        teamId,
        entityId: String(newRole.id),
        entityName: dto.name,
      });
    }

    return created;
  }

  /**
   * Update a role (permissions, name, description)
   */
  async updateRole(
    teamId: number,
    roleId: number,
    dto: UpdateRoleDto,
    userId?: number,
  ) {
    const role = await this.getRole(roleId, teamId);

    if (role.isSystem && dto.name) {
      // Allow updating description but maybe warn about name?
      // For now, allow name change even for system roles or block it?
      // Usually system roles like "Owner" shouldn't be renamed to avoid confusion, but description is fine.
      // Let's block name change for system roles.
      if (dto.name !== role.name) {
        throw new ForbiddenException('Cannot rename system roles');
      }
    }

    // Update role details
    if (dto.name || dto.description) {
      await db
        .update(roles)
        .set({
          name: dto.name,
          description: dto.description,
          updatedAt: new Date(),
        })
        .where(eq(roles.id, roleId));
    }

    // Update permissions if provided
    if (dto.ids_permissions) {
      // Delete existing
      await db
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));

      // Insert new
      if (dto.ids_permissions.length > 0) {
        await this.assignPermissions(roleId, dto.ids_permissions);
      }
    }

    const updated = await this.getRole(roleId, teamId);

    if (userId) {
      await this.auditWriteService.logCustomRoleUpdated({
        userId,
        teamId,
        entityId: String(roleId),
        entityName: updated.name,
        changes: dto as unknown as Record<
          string,
          { from: unknown; to: unknown }
        >,
      });
    }

    return updated;
  }

  /**
   * Delete a custom role
   */
  async deleteRole(teamId: number, roleId: number, userId?: number) {
    const role = await this.getRole(roleId, teamId);

    if (role.isSystem) {
      throw new ForbiddenException('Cannot delete system roles');
    }

    // Check if any members are assigned to this role
    const memberCount = await db
      .select({ count: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.roleId, roleId));

    if (memberCount.length > 0) {
      throw new ConflictException(
        'Cannot delete role that is assigned to members. Reassign them first.',
      );
    }

    if (userId) {
      await this.auditWriteService.logCustomRoleDeleted({
        userId,
        teamId,
        entityId: String(roleId),
        entityName: role.name,
      });
    }

    await db.delete(roles).where(eq(roles.id, roleId));
    return true;
  }

  /**
   * Helper: Assign permissions to a role
   */
  async assignPermissions(roleId: number, permissionIds: number[]) {
    // Verify permissions exist (optional, but good practice)
    // For speed, just try insert
    const values = permissionIds.map((pid) => ({
      roleId,
      permissionId: pid,
    }));

    await db.insert(rolePermissions).values(values).onConflictDoNothing();
  }

  /**
   * Fetch all available system permissions (for the UI list)
   */
  async getAllPermissions() {
    return db.select().from(permissions);
  }

  /**
   * Get role by name and team
   */
  async getRoleByName(teamId: number, name: string) {
    // Determine case sensitivity based on DB collation, but assuming standard behavior
    // Migration inserted "Owner", "Admin", etc. User inputs might be lowercase.
    // We try exact match first.
    return db.query.roles.findFirst({
      where: and(eq(roles.teamId, teamId), eq(roles.name, name)),
    });
  }

  /**
   * Initialize default roles for a new team
   */
  async initializeDefaultRoles(teamId: number) {
    // 1. Get all permission IDs to assign easily
    const allPerms = await this.getAllPermissions();
    const permsMap = new Map(allPerms.map((p) => [p.key, p.id]));

    const getIds = (keys: string[]) =>
      keys
        .map((k) => permsMap.get(k))
        .filter((id) => id !== undefined) as number[];

    // 2. Define Roles
    const defaults = [
      {
        name: 'Owner',
        desc: 'Full access to everything',
        perms: allPerms.map((p) => p.id),
      },
      {
        name: 'Admin',
        desc: 'Can manage members and settings',
        perms: allPerms.filter((p) => p.key !== 'team.delete').map((p) => p.id),
      },
      {
        name: 'Agent',
        desc: 'Standard support staff',
        perms: getIds([
          'chat.view',
          'chat.send',
          'chat.assign',
          'workflow.move',
          'kb.manage',
        ]),
      },
      {
        name: 'Viewer',
        desc: 'Read-only access',
        perms: getIds(['chat.view', 'settings.view']),
      },
    ];

    for (const def of defaults) {
      const [role] = await db
        .insert(roles)
        .values({
          teamId,
          name: def.name,
          description: def.desc,
          isSystem: true,
        })
        .returning();

      if (def.perms.length > 0) {
        await this.assignPermissions(role.id, def.perms);
      }
    }
  }
}
