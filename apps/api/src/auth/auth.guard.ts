import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { hashSecret, SESSION_COOKIE } from '../common/security';
import { IS_PUBLIC_KEY, PERMISSION_KEY } from './auth.decorators';
import { AuthRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length < 30) throw new UnauthorizedException('Vui lòng đăng nhập');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSecret(token) },
      include: { user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    const roles = session.user.roles.map(({ role }) => role.code);
    const permissions = [...new Set(session.user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code)))];
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (required && !permissions.includes(required)) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    const authRequest = request as AuthRequest;
    authRequest.authUser = { id: session.user.id, email: session.user.email, fullName: session.user.fullName, roles, permissions };
    authRequest.sessionId = session.id;
    return true;
  }
}
