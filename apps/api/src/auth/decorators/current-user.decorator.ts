import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

/**
 * Injects the authenticated user (populated by JwtStrategy) into a controller
 * handler. Optionally accepts a key to extract a single field.
 *
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 *   me(@CurrentUser('userId') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
