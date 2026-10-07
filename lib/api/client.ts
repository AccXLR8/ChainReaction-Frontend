import type { AuthResponse } from '@/features/auth/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/backend';

/** Fetch JSON from the configured backend and turn API errors into readable messages. */
export async function request<T extends Record<string, unknown> = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const raw = await response.text();

  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error(
        `The game server could not process that request (${response.status}). Please try again shortly.`,
      );
    }
    throw new Error(
      String(data.detail || data.message || raw || `Request failed (${response.status})`),
    );
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
