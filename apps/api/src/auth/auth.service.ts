import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const HASH_ROUNDS = 10;

export type JwtPayload = { sub: string; email: string };

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string, name?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('email already registered');

    const passwordHash = await bcrypt.hash(password, HASH_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, password: passwordHash, name: name ?? null },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    return { user, accessToken: this.signAccessToken(user.id, user.email) };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new UnauthorizedException('invalid credentials');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('invalid credentials');

    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
    return { user: publicUser, accessToken: this.signAccessToken(user.id, user.email) };
  }

  private signAccessToken(userId: string, email: string) {
    const payload: JwtPayload = { sub: userId, email };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
  }
}
