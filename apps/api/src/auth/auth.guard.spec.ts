import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../database/prisma.service';
import { hashSecret, SESSION_COOKIE } from '../common/security';

function context(cookie?: string): ExecutionContext {
  const request = { cookies: cookie ? { [SESSION_COOKIE]: cookie } : {} };
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const token = 'a'.repeat(43);
  const findUnique = jest.fn();
  const prisma = { session: { findUnique } } as unknown as PrismaService;
  const reflector = { getAllAndOverride: jest.fn((key: string) => key === 'requiredPermission' ? 'users.manage' : false) } as unknown as Reflector;
  const guard = new AuthGuard(prisma, reflector);

  beforeEach(() => findUnique.mockReset());

  it('rejects a request without a session', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('checks the stored token hash and rejects an insufficient role', async () => {
    findUnique.mockResolvedValue({
      id: 'session-1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', email: 'manager@tms.local', fullName: 'Manager', active: true,
        roles: [{ role: { code: 'MANAGER', permissions: [{ permission: { code: 'dashboard.view' } }] } }] },
    });
    await expect(guard.canActivate(context(token))).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashSecret(token) } }));
  });

  it('rejects an expired session', async () => {
    findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() - 1000), user: { active: true } });
    await expect(guard.canActivate(context(token))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
