import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { clearRefreshCookie, setRefreshCookie } from './cookies';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { GoogleProfile } from './strategies/google.strategy';
import type { RefreshUser } from './strategies/jwt-refresh.strategy';

type RequestWithGoogleProfile = Request & { user: GoogleProfile };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.register(dto.email, dto.password, dto.name);
    setRefreshCookie(res, this.config, tokens.refreshToken);
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(dto.email, dto.password);
    setRefreshCookie(res, this.config, tokens.refreshToken);
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(200)
  async refresh(@CurrentUser() user: RefreshUser, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.refresh(user.userId, user.refreshToken);
    setRefreshCookie(res, this.config, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser('userId') userId: string, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(userId);
    clearRefreshCookie(res, this.config);
  }

  @Get('me')
  me(@CurrentUser('userId') userId: string) {
    return this.auth.me(userId);
  }

  @Roles(Role.ADMIN)
  @Get('admin/stats')
  adminStats() {
    return this.auth.adminStats();
  }

  // Kicks off the Google OAuth redirect flow. The guard bounces the client
  // to accounts.google.com; this handler body never actually runs.
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleAuth(): void {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: RequestWithGoogleProfile, @Res() res: Response) {
    const { tokens } = await this.auth.oauthLoginWithGoogle(req.user);
    setRefreshCookie(res, this.config, tokens.refreshToken);
    const target = this.config.get<string>('OAUTH_SUCCESS_REDIRECT', 'http://localhost:5173');
    res.redirect(target);
  }
}
