import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { REFRESH_COOKIE } from './strategies/jwt-refresh.strategy';

function parseDurationMs(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multiplier = { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7 }[unit];
  return value * multiplier;
}

export function refreshCookieOptions(config: ConfigService): CookieOptions {
  const secure = config.get<string>('COOKIE_SECURE', 'false') === 'true';
  const domain = config.get<string>('COOKIE_DOMAIN', 'localhost');
  const refreshExpiresIn = config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  return {
    httpOnly: true,
    secure,
    // In dev over http both API and Web are same-site (localhost); 'lax' is enough.
    // In prod over https with different domains, set COOKIE_SECURE=true to enable 'none'.
    sameSite: secure ? 'none' : 'lax',
    domain,
    path: '/auth',
    maxAge: parseDurationMs(refreshExpiresIn),
  };
}

export function setRefreshCookie(res: Response, config: ConfigService, token: string) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(config));
}

export function clearRefreshCookie(res: Response, config: ConfigService) {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions(config);
  res.clearCookie(REFRESH_COOKIE, options);
}
