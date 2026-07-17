import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { GoogleButton } from '../components/GoogleButton';
import { useAuth } from '../context/AuthContext';
import { pickErrorMessage } from '../lib/api';
import { loginSchema, type LoginFormValues } from '../lib/schemas';

type LocationState = { from?: { pathname: string } };

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  if (user) return <Navigate to="/" replace />;

  const redirectTo = (location.state as LocationState)?.from?.pathname ?? '/';

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await login(values.email, values.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setSubmitError(pickErrorMessage(err, 'falha no login'));
    }
  });

  return (
    <div className="auth-card">
      <h1>Entrar</h1>
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <label>
          E-mail
          <input type="email" autoComplete="email" {...register('email')} />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" {...register('password')} />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </label>
        {submitError && <p className="auth-error">{submitError}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <div className="auth-divider">
        <span>ou</span>
      </div>
      <GoogleButton />
      <p className="auth-switch-line">
        Não tem conta? <Link to="/register">Registre-se</Link>
      </p>
    </div>
  );
}
