import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Main axios instance used by the app. `withCredentials: true` is required so
 * the refresh cookie is sent on /auth/refresh calls. Request/response
 * interceptors are attached inside AuthProvider so they can see the current
 * access token and call setAccessToken on rotation.
 */
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

/**
 * Bare instance for calling /auth/refresh from inside the response interceptor,
 * so we don't recurse if the refresh itself returns 401.
 */
export const refreshApi = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export function pickErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: unknown } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(', ');
    if (typeof data?.message === 'string') return data.message;
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}
