import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { AuthenticatedUser, JwtPayload } from './jwt.strategy';

export const REFRESH_COOKIE = 'refreshToken';

export type RefreshUser = AuthenticatedUser & { refreshToken: string };

function cookieExtractor(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE] ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): RefreshUser {
    const refreshToken = cookieExtractor(req);
    if (!refreshToken) throw new UnauthorizedException('missing refresh token');
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken,
    };
  }
}
