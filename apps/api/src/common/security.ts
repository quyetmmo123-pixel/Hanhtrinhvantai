import { createHash, randomBytes } from 'crypto';

export const SESSION_COOKIE = 'tms_session';
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_MS = 30 * 60 * 1000;
export const newSecret = () => randomBytes(32).toString('base64url');
export const hashSecret = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
