import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { InternalAxiosRequestConfig } from 'axios';
import { api, refreshApi } from '../lib/api';
import type { AuthResponse, RefreshResponse, User } from '../types';

type AuthContextValue = {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// URLs where we must NOT try to auto-refresh on 401 (would recurse or race).
const REFRESH_BLACKLIST = ['/auth/refresh', '/auth/login', '/auth/register'];

function shouldAttemptRefresh(url: string | undefined): boolean {
  if (!url) return false;
  return !REFRESH_BLACKLIST.some((path) => url.includes(path));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Interceptors close over these refs so they always read the latest value.
  const accessTokenRef = useRef<string | null>(null);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // Coalesce concurrent 401s: only one refresh flight at a time; every other
  // request waits on the same promise.
  const refreshFlight = useRef<Promise<string> | null>(null);

  useEffect(() => {
    async function runRefresh(): Promise<string> {
      if (!refreshFlight.current) {
        refreshFlight.current = refreshApi
          .post<RefreshResponse>('/auth/refresh')
          .then((res) => res.data.accessToken)
          .finally(() => {
            refreshFlight.current = null;
          });
      }
      return refreshFlight.current;
    }

    const reqId = api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = accessTokenRef.current;
      if (token) config.headers.set('Authorization', `Bearer ${token}`);
      return config;
    });

    const resId = api.interceptors.response.use(
      (r) => r,
      async (error) => {
        const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        if (
          error.response?.status === 401 &&
          !original._retry &&
          shouldAttemptRefresh(original.url)
        ) {
          original._retry = true;
          try {
            const newAccess = await runRefresh();
            setAccessToken(newAccess);
            accessTokenRef.current = newAccess;
            original.headers.set('Authorization', `Bearer ${newAccess}`);
            return api(original);
          } catch {
            setUser(null);
            setAccessToken(null);
            accessTokenRef.current = null;
          }
        }
        return Promise.reject(error);
      },
    );

    return () => {
      api.interceptors.request.eject(reqId);
      api.interceptors.response.eject(resId);
    };
  }, []);

  // On mount: try silent refresh. If cookie is valid, we hydrate; otherwise
  // we render the anonymous UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: refresh } = await refreshApi.post<RefreshResponse>('/auth/refresh');
        if (cancelled) return;
        setAccessToken(refresh.accessToken);
        accessTokenRef.current = refresh.accessToken;
        const { data: me } = await api.get<User>('/auth/me');
        if (cancelled) return;
        setUser(me);
      } catch {
        // no valid session — stay anonymous
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      loading,
      login: async (email, password) => {
        const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
        setUser(data.user);
        setAccessToken(data.accessToken);
        accessTokenRef.current = data.accessToken;
      },
      register: async (email, password, name) => {
        const { data } = await api.post<AuthResponse>('/auth/register', {
          email,
          password,
          ...(name ? { name } : {}),
        });
        setUser(data.user);
        setAccessToken(data.accessToken);
        accessTokenRef.current = data.accessToken;
      },
      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // even if logout call fails (network / already-expired), clear locally
        }
        setUser(null);
        setAccessToken(null);
        accessTokenRef.current = null;
      },
    }),
    [user, accessToken, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
