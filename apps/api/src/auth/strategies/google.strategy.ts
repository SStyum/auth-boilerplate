import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export type GoogleProfile = {
  googleId: string;
  email: string;
  name: string | null;
};

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      // Placeholder defaults so the strategy can be constructed even when OAuth
      // is not yet configured — GoogleAuthGuard returns 501 before we ever hit
      // Google with these values.
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'unset',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'unset',
      callbackURL: config.get<string>(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:3000/auth/google/callback',
      ),
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new UnauthorizedException('google account has no email'), false);
    const result: GoogleProfile = {
      googleId: profile.id,
      email,
      name: profile.displayName ?? null,
    };
    done(null, result);
  }
}
