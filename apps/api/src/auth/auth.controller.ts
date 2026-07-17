import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { clearRefreshCookie, setRefreshCookie } from './cookies';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

type RequestWithUser = Request & { user: { userId: string; email: string } };
type RequestWithRefresh = Request & {
  user: { userId: string; email: string; refreshToken: string };
};

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
  async refresh(@Req() req: RequestWithRefresh, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.refresh(req.user.userId, req.user.refreshToken);
    setRefreshCookie(res, this.config, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.user.userId);
    clearRefreshCookie(res, this.config);
  }

  @Get('me')
  me(@Req() req: RequestWithUser) {
    return this.auth.me(req.user.userId);
  }
}
