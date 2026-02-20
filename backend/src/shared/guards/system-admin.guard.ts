/**
 * System Admin Guard
 *
 * Protects routes that require system admin privileges.
 * Checks if the authenticated user has is_system_admin = true.
 */

import { db } from '@database/db.connection';
import { users } from '@database/schema';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

@Injectable()
export class SystemAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { isSystemAdmin: true },
    });

    if (!user?.isSystemAdmin) {
      throw new ForbiddenException('System administrator access required');
    }

    return true;
  }
}
