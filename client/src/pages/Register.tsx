import React, { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError('Todos os campos marcados são obrigatórios.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas digitadas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      navigate('/activities', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao realizar cadastro.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h2 className="page-title">👨‍🏫 Cadastro de Professor</h2>
        <p className="page-subtitle">
          Crie sua conta para começar a gerar diagnósticos e feedbacks pedagógicos com apoio de IA.
        </p>
      </div>

      <div className="card" style={{ maxWidth: '460px', margin: '0 auto' }}>
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
            <label className="input-label" htmlFor="name">
              Nome Completo *
            </label>
            <input
              id="name"
              type="text"
              className="input"
              placeholder="Ex: Profa. Maria Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="email">
              E-mail *
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="maria.silva@escola.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="password">
              Senha (mínimo 6 caracteres) *
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="Crie uma senha segura"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="confirmPassword">
              Confirme sua Senha *
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="input"
              placeholder="Repita a senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={loading}
          >
            {loading ? 'Cadastrando...' : 'Criar Conta de Professor'}
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
          Já possui conta?{' '}
          <Link
            to="/login"
            style={{
              color: 'var(--color-primary, #6366f1)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Faça login
          </Link>
        </div>
      </div>
    </div>
  );
}
