import { Request } from 'express';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
};

export type AuthRequest = Request & { authUser: AuthUser; sessionId: string };
