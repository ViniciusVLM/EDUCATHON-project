import { useState, FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { IconCap, IconAlertCircle } from '../components/ui/Icons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/painel';

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
      const msg = err instanceof Error ? err.message : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      <div className="auth-split__container animate-fade-in">
        {/* Painel roxo curvo decorativo com marca e frase pedagógica */}
        <div className="auth-split__hero">
          <Link to="/" className="auth-split__hero-brand" aria-label="Educathon - Página Inicial">
            <div className="auth-split__hero-logo">
              <IconCap size={28} />
            </div>
            <span className="auth-split__hero-title">Educathon</span>
          </Link>

          <div className="auth-split__hero-body">
            <h1 className="auth-split__hero-tagline">Copiloto Pedagógico com IA</h1>
            <p className="auth-split__hero-desc">
              A IA nunca dá nota; o professor decide. Feedbacks formativos com precisão, agilidade e empatia para potencializar a aprendizagem.
            </p>
          </div>

          <div className="auth-split__hero-footer">
            <span>✨ Desenvolvido para professores e educadores</span>
          </div>
        </div>

        {/* Formulário em cartão branco arredondado */}
        <div className="auth-split__form-side">
          <div className="auth-split__form-header">
            <h2 className="auth-split__form-title">🔐 Acesso do Professor</h2>
            <p className="auth-split__form-subtitle">
              Entre com seu e-mail e senha para gerenciar suas turmas, atividades e correções.
            </p>
          </div>

          {error && (
            <div className="auth-split__error" role="alert">
              <IconAlertCircle size={18} />
              <span>{error}</span>
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

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="ui-btn--full"
            >
              {loading ? 'Entrando...' : 'Entrar na Plataforma'}
            </Button>
          </form>

          <div className="auth-split__footer-link">
            Novo por aqui?{' '}
            <Link to="/register">
              Cadastre-se como professor
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
