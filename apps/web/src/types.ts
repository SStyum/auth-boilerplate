export type Role = 'USER' | 'ADMIN';

export type User = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
};

export type AuthResponse = { user: User; accessToken: string };
export type RefreshResponse = { accessToken: string };
