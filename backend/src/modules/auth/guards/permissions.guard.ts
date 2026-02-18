import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '@shared/types';
import { PermissionService } from '../../../shared/services/permission.service';

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<string>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user || !user.userId) {
      return false;
    }

    // Attempt to resolve Team ID
    let teamId =
      request.params.teamId || request.query.teamId || request.body.teamId;

    // Special case: If route is /teams/:id, the :id is teamId
    // Or if this is TeamController and param is :id
    if (
      !teamId &&
      request.params.id &&
      (request.path.includes('/teams') || request.path.includes('/team'))
    ) {
      teamId = request.params.id;
    }

    // If it's a chat route, try to get teamId from chat
    if (!teamId && request.params.id && request.path.includes('/chats')) {
      const chatId = request.params.id;
      teamId = (
        await this.permissionService.getTeamIdForChat(chatId)
      )?.toString();
    }

    // For calendar routes, get teamId from user's primary team
    if (!teamId && request.path.includes('/calendar')) {
      teamId = (
        await this.permissionService.getUserTeamIdOrNull(user.userId)
      )?.toString();
    }

    if (!teamId) {
      // Cannot determine context
      return false;
    }

    const result = await this.permissionService.checkPermission(
      user.userId,
      Number(teamId),
      requiredPermission,
    );

    if (!result.allowed) {
      throw new ForbiddenException(result.reason || 'Forbidden');
    }

    return true;
  }
}
