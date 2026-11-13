export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export type CurrentUser = { id: string; email: string; fullName: string; roles: string[]; permissions: string[] };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(options.headers);
    if (!(typeof FormData !== 'undefined' && options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được API. Hãy kiểm tra backend.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = body.message;
    throw new ApiError(response.status, Array.isArray(raw) ? raw.join(', ') : (raw || 'Yêu cầu thất bại'));
  }
  return body as T;
}
