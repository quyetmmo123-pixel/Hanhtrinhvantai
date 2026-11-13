import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origin = req.headers.origin;
    if (origin && origin !== process.env.WEB_ORIGIN) throw new ForbiddenException('Origin không hợp lệ');
    // Origin is absent for CLI clients; browser cross-site form requests use an Origin header.
    return true;
  }
}
