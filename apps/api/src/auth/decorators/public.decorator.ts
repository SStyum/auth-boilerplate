import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — bypasses the globally-registered JwtAuthGuard.
 * Use on register, login, refresh and health endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
