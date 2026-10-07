import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { IconCap, IconAlertCircle } from '../components/ui/Icons';

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

    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
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
      navigate('/painel', { replace: true });
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
            <h1 className="auth-split__hero-tagline">Junte-se ao Educathon</h1>
            <p className="auth-split__hero-desc">
              Economize horas na correção e ofereça feedbacks formativos ricos para cada estudante. O controle pedagógico é sempre seu.
            </p>
          </div>

          <div className="auth-split__hero-footer">
            <span>✨ A IA nunca dá nota; o professor decide</span>
          </div>
        </div>

        {/* Formulário em cartão branco arredondado */}
        <div className="auth-split__form-side">
          <div className="auth-split__form-header">
            <h2 className="auth-split__form-title">👨‍🏫 Cadastro de Professor</h2>
            <p className="auth-split__form-subtitle">
              Crie sua conta para começar a gerar diagnósticos e feedbacks pedagógicos com apoio de IA.
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
                Senha (mínimo 8 caracteres) *
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

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="ui-btn--full"
            >
              {loading ? 'Cadastrando...' : 'Criar Conta de Professor'}
            </Button>
          </form>

          <div className="auth-split__footer-link">
            Já possui conta?{' '}
            <Link to="/login">
              Faça login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
