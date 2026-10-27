import type { AuthResponse } from '@/features/auth/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/backend';

/** HTTP failure that keeps the status code available to flows such as session recovery. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Converts FastAPI string and validation-array errors into readable UI messages. */
export function getApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object' || !('detail' in data)) return fallback;

  const detail = (data as { detail: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => {
      if (!item || typeof item !== 'object' || !('msg' in item)) return [];
      return typeof item.msg === 'string' ? [item.msg] : [];
    });
    if (messages.length) return messages.join(', ');
  }
  return fallback;
}

/** Fetch JSON from the configured backend and turn API errors into readable messages. */
export async function request<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const raw = await response.text();

  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) as unknown : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const fallback = response.status >= 500
      ? `The game server could not process that request (${response.status}). Please try again shortly.`
      : raw || `Request failed (${response.status})`;
    throw new ApiError(getApiError(data, fallback), response.status);
  }

  return data as T;
}

export function authRequest(path: string, body?: unknown): Promise<AuthResponse> {
  return request<AuthResponse>(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
