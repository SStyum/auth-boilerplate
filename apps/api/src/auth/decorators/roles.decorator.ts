import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles. Requires the globally-registered
 * RolesGuard (which runs after JwtAuthGuard has populated req.user).
 *
 *   @Roles(Role.ADMIN)
 *   @Get('admin/stats')
 *   stats() { ... }
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
