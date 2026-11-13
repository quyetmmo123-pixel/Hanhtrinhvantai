import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import * as argon2 from 'argon2';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../common/audit.service';
import { hashSecret, newSecret, normalizeEmail, RESET_MS, SESSION_COOKIE, SESSION_MS } from '../common/security';
import { AuthRequest } from './auth.types';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private cookieOptions() {
    return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: SESSION_MS };
  }

  async login(dto: LoginDto, req: Request, res: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) } });
    if (!user || !user.active || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    const token = newSecret();
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: hashSecret(token), expiresAt: new Date(Date.now() + SESSION_MS), ipAddress: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) },
    });
    await this.audit.record({ actorId: user.id, action: 'LOGIN', entity: 'Session', ipAddress: req.ip });
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
    return { message: 'Đăng nhập thành công' };
  }

  async logout(req: AuthRequest, res: Response) {
    await this.prisma.session.delete({ where: { id: req.sessionId } });
    await this.audit.record({ actorId: req.authUser.id, action: 'LOGOUT', entity: 'Session', entityId: req.sessionId, ipAddress: req.ip });
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    return { message: 'Đã đăng xuất' };
  }

  async changePassword(req: AuthRequest, dto: ChangePasswordDto, res: Response) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.authUser.id } });
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) throw new BadRequestException('Mật khẩu hiện tại không đúng');
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'PASSWORD_CHANGED', entity: 'User', entityId: user.id, ipAddress: req.ip } });
    });
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async forgotPassword(dto: ForgotPasswordDto, req: Request) {
    const message = 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi.';
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) } });
    if (!user || !user.active) return { message };
    const token = newSecret();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashSecret(token), expiresAt: new Date(Date.now() + RESET_MS) },
    });
    const link = new URL('/reset-password', process.env.WEB_ORIGIN || 'http://localhost:3000');
    link.searchParams.set('token', token);
    const transport = nodemailer.createTransport({ host: process.env.MAIL_HOST || 'localhost', port: Number(process.env.MAIL_PORT || 1025), secure: false });
    try {
      await transport.sendMail({
        from: process.env.MAIL_FROM || 'TMS <no-reply@tms.local>', to: user.email,
        subject: 'Đặt lại mật khẩu TMS',
        text: `Liên kết đặt lại mật khẩu có hiệu lực 30 phút:\n${link.toString()}`,
      });
    } catch (error) {
      // Keep the public response identical for known and unknown addresses.
      console.error('Password reset email delivery failed', error);
    }
    await this.audit.record({ actorId: user.id, action: 'PASSWORD_RESET_REQUESTED', entity: 'User', entityId: user.id, ipAddress: req.ip });
    return { message };
  }

  async resetPassword(dto: ResetPasswordDto, req: Request) {
    const tokenHash = hashSecret(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn');
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new BadRequestException('Liên kết đã được sử dụng');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: record.userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } });
      await tx.auditLog.create({ data: { actorId: record.userId, action: 'PASSWORD_RESET', entity: 'User', entityId: record.userId, ipAddress: req.ip } });
    });
    return { message: 'Đặt lại mật khẩu thành công' };
  }
}
