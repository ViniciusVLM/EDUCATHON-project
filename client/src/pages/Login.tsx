import React, { useState, FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/activities';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Por favor, preencha o e-mail e a senha.');
      return;
    }

    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao entrar. Verifique suas credenciais.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h2 className="page-title">🔐 Acesso do Professor</h2>
        <p className="page-subtitle">
          Entre com seu e-mail e senha para gerenciar suas turmas, atividades e correções.
        </p>
      </div>

      <div className="card" style={{ maxWidth: '440px', margin: '0 auto' }}>
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md, 8px)',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              fontSize: '0.9rem',
              marginBottom: '1.25rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="input-group">
            <label className="input-label" htmlFor="email">
              E-mail institucional ou pessoal *
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="exemplo@escola.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="password">
              Senha *
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar na Plataforma'}
          </button>
        </form>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--color-border, rgba(255,255,255,0.1))',
            textAlign: 'center',
            fontSize: '0.9rem',
            color: 'var(--color-text-muted)',
          }}
        >
          Novo por aqui?{' '}
          <Link
            to="/register"
            style={{
              color: 'var(--color-primary, #6366f1)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Cadastre-se como professor
          </Link>
        </div>
      </div>
    </div>
  );
}
