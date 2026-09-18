// Typed fetch wrapper for the same-origin JSON API under /api.
//
// Every call sends the session cookie (credentials: 'same-origin') and JSON
// headers. A non-2xx response becomes an ApiRequestError carrying the status
// and the { error, message } body the API always returns, so pages can branch
// on `error` and show `message` verbatim.
import type { ApiError } from '@inftrees/shared';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly error: string;

  constructor(status: number, error: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.error = error;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.error === 'string' && typeof v.message === 'string';
}

function defaultMessage(status: number): string {
  if (status === 401) return 'You are not signed in.';
  if (status === 403) return 'You are not allowed to do that.';
  if (status === 404) return 'That was not found.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'The server had a problem. Try again in a moment.';
  return `Request failed (HTTP ${status})`;
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }

  const text = await res.text();
  let data: unknown = null;
  if (text !== '') {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = isApiError(data) ? data : null;
    throw new ApiRequestError(res.status, err?.error ?? `http_${res.status}`, err?.message ?? defaultMessage(res.status));
  }
  return data as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body ?? {});
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, body);
  },
  del<T>(path: string): Promise<T> {
    return request<T>('DELETE', path);
  },
};

/** A human-readable message for anything thrown by the api wrapper. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Try again.';
}

/** True when `e` is an API error with one of the given `error` codes. */
export function isApiErrorCode(e: unknown, ...codes: string[]): e is ApiRequestError {
  return e instanceof ApiRequestError && codes.includes(e.error);
}
