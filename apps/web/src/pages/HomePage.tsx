import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, pickErrorMessage } from '../lib/api';

type AdminStats = { userCount: number; adminCount: number };

export function HomePage() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    setLoadingStats(true);
    api
      .get<AdminStats>('/auth/admin/stats')
      .then((r) => setStats(r.data))
      .catch((err) => setStatsError(pickErrorMessage(err, 'falha ao carregar stats')))
      .finally(() => setLoadingStats(false));
  }, [user?.role]);

  if (!user) return null;

  return (
    <div className="home">
      <header className="home-header">
        <h1>Auth Boilerplate</h1>
        <button type="button" className="logout-btn" onClick={logout}>
          Sair
        </button>
      </header>
      <section className="user-card">
        <h2>Sessão ativa</h2>
        <dl>
          <dt>ID</dt>
          <dd>
            <code>{user.id}</code>
          </dd>
          <dt>E-mail</dt>
          <dd>{user.email}</dd>
          <dt>Nome</dt>
          <dd>{user.name ?? <em>—</em>}</dd>
          <dt>Role</dt>
          <dd>
            <span className={`role-pill role-${user.role.toLowerCase()}`}>{user.role}</span>
          </dd>
          <dt>Criado em</dt>
          <dd>{new Date(user.createdAt).toLocaleString('pt-BR')}</dd>
        </dl>
      </section>

      {user.role === 'ADMIN' && (
        <section className="user-card">
          <h2>Admin stats</h2>
          {loadingStats && <p className="status">Carregando…</p>}
          {statsError && <p className="auth-error">{statsError}</p>}
          {stats && (
            <p>
              <strong>{stats.userCount}</strong> usuários no total ·{' '}
              <strong>{stats.adminCount}</strong> administradores
            </p>
          )}
        </section>
      )}
    </div>
  );
}
