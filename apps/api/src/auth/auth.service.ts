import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { GoogleProfile } from './strategies/google.strategy';
import type { JwtPayload } from './strategies/jwt.strategy';

const PASSWORD_ROUNDS = 10;

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: Date;
};

export type TokenPair = { accessToken: string; refreshToken: string };
export type AuthResult = { user: PublicUser; tokens: TokenPair };

// JWTs share an identical first 72 bytes (header + '.' + start of payload) when
// signed for the same user, and bcrypt silently truncates its input at 72 bytes,
// so comparing raw JWTs with bcrypt is broken. Use SHA-256 instead — refresh
// tokens already carry ~256 bits of entropy in their signature, so salting
// (bcrypt/argon2) adds no defensive value against dictionary attacks here.
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

function toPublic(user: {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('email already registered');

    const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, password: passwordHash, name: name ?? null },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const tokens = await this.issueTokens(user);
    return { user: toPublic(user), tokens };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new UnauthorizedException('invalid credentials');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('invalid credentials');

    const tokens = await this.issueTokens(user);
    return { user: toPublic(user), tokens };
  }

  async oauthLoginWithGoogle(profile: GoogleProfile): Promise<AuthResult> {
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.googleId,
            name: byEmail.name ?? profile.name,
          },
        });
      }
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          googleId: profile.googleId,
        },
      });
    }

    const tokens = await this.issueTokens(user);
    return { user: toPublic(user), tokens };
  }

  async refresh(userId: string, presentedRefreshToken: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.hashedRefreshToken) throw new UnauthorizedException('refresh denied');

    const presentedHash = hashRefreshToken(presentedRefreshToken);
    if (!safeEqualHex(presentedHash, user.hashedRefreshToken)) {
      throw new UnauthorizedException('refresh denied');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException('user not found');
    return toPublic(user);
  }

  async adminStats(): Promise<{ userCount: number; adminCount: number }> {
    const [userCount, adminCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
    ]);
    return { userCount, adminCount };
  }

  private async issueTokens(user: { id: string; email: string; role: Role }): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { hashedRefreshToken: hashRefreshToken(refreshToken) },
    });
    return { accessToken, refreshToken };
  }
}
