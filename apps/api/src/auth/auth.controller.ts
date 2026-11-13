import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from './auth.decorators';
import { AuthRequest } from './auth.types';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('login') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.auth.login(dto, req, res); }

  @Post('logout')
  logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) { return this.auth.logout(req, res); }

  @Get('me')
  me(@Req() req: AuthRequest) { return req.authUser; }

  @Post('change-password')
  changePassword(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) { return this.auth.changePassword(req, dto, res); }

  @Public() @Post('forgot-password') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) { return this.auth.forgotPassword(dto, req); }

  @Public() @Post('reset-password') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) { return this.auth.resetPassword(dto, req); }
}
