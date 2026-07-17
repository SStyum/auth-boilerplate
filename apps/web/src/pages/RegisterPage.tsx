import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { GoogleButton } from '../components/GoogleButton';
import { useAuth } from '../context/AuthContext';
import { pickErrorMessage } from '../lib/api';
import { registerSchema, type RegisterFormValues } from '../lib/schemas';

export function RegisterPage() {
  const { user, register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await registerUser(values.email, values.password, values.name || undefined);
      navigate('/', { replace: true });
    } catch (err) {
      setSubmitError(pickErrorMessage(err, 'falha no registro'));
    }
  });

  return (
    <div className="auth-card">
      <h1>Criar conta</h1>
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <label>
          Nome (opcional)
          <input type="text" autoComplete="name" {...register('name')} />
          {errors.name && <span className="field-error">{errors.name.message}</span>}
        </label>
        <label>
          E-mail
          <input type="email" autoComplete="email" {...register('email')} />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </label>
        <label>
          Senha
          <input type="password" autoComplete="new-password" {...register('password')} />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </label>
        {submitError && <p className="auth-error">{submitError}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <div className="auth-divider">
        <span>ou</span>
      </div>
      <GoogleButton />
      <p className="auth-switch-line">
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  );
}
