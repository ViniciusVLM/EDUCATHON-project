/**
 * Entrada do aluno: login (/aluno/entrar) e cadastro com o código da turma (/aluno/cadastro).
 * A sessão do aluno usa um token separado do professor.
 */
import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { IconAlertCircle } from '../../components/ui/Icons';
import { Mascot } from '../../components/ui/Mascot';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { loginStudent, registerStudent, loginStudentWithGoogle } from '../../services/api';

function StudentShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="auth-split auth-split--student">
      <div className="auth-split__container animate-fade-in">
        <div className="auth-split__hero">
          <Link to="/" className="auth-split__hero-brand" aria-label="Educathon - Página Inicial">
            <div className="auth-split__hero-logo">
              <Mascot variant="head" size={30} />
            </div>
            <span className="auth-split__hero-title">Educathon</span>
          </Link>
          <div className="auth-split__hero-body">
            <Mascot size={150} className="auth-mascot" />
            <h1 className="auth-split__hero-tagline">Portal do aluno</h1>
            <p className="auth-split__hero-desc">
              Veja suas matérias, as atividades da turma, a nota que o professor lançou e o feedback que ele aprovou para você.
            </p>
          </div>
          <div className="auth-split__hero-footer">
            <span>Seus dados ficam só entre você e seus professores</span>
          </div>
        </div>
        <div className="auth-split__form-side">
          <div className="auth-split__form-header">
            <h2 className="auth-split__form-title">{title}</h2>
            <p className="auth-split__form-subtitle">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="auth-split__error" role="alert">
      <IconAlertCircle size={18} />
      <span>{message}</span>
    </div>
  );
}

export function StudentLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classCode, setClassCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [pendingGoogleToken, setPendingGoogleToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Preencha o e-mail e a senha.');
      return;
    }
    setLoading(true);
    try {
      await loginStudent({ email: email.trim(), password });
      navigate('/aluno', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(idToken: string, code?: string) {
    setError('');
    try {
      await loginStudentWithGoogle(idToken, code);
      navigate('/aluno', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível entrar com o Google.';
      if (/código da turma/i.test(msg)) {
        setNeedsCode(true);
        setPendingGoogleToken(idToken);
      }
      setError(msg);
    }
  }

  return (
    <StudentShell title="Entrar como aluno" subtitle="Use o e-mail e a senha que você cadastrou.">
      <ErrorBox message={error} />

      {needsCode && pendingGoogleToken ? (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            await handleGoogle(pendingGoogleToken, classCode);
            setLoading(false);
          }}
        >
          <div className="input-group">
            <label className="input-label" htmlFor="google-class-code">Código da turma *</label>
            <input
              id="google-class-code"
              className="input input--code"
              placeholder="ABC-1234"
              value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              autoComplete="off"
              required
            />
          </div>
          <Button type="submit" variant="primary" size="lg" loading={loading} className="ui-btn--full">
            Entrar na turma
          </Button>
        </form>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="input-group">
              <label className="input-label" htmlFor="student-email">E-mail *</label>
              <input
                id="student-email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="student-password">Senha *</label>
              <input
                id="student-password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" variant="primary" size="lg" loading={loading} className="ui-btn--full" id="btn-student-login">
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          <GoogleSignInButton onToken={(t) => handleGoogle(t)} onError={setError} />
        </>
      )}

      <div className="auth-split__footer-link">
        Primeiro acesso? <Link to="/aluno/cadastro">Cadastre-se com o código da turma</Link>
      </div>
      <div className="auth-split__footer-link auth-split__footer-link--student">
        É professor? <Link to="/login">Entre na área do professor</Link>
      </div>
    </StudentShell>
  );
}

export function StudentRegister() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    classCode: (params.get('codigo') || '').toUpperCase(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.classCode.trim()) {
      setError('Preencha todos os campos.');
      return;
    }
    if (form.password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await registerStudent({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        classCode: form.classCode.trim(),
      });
      navigate('/aluno', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <StudentShell
      title="Cadastro do aluno"
      subtitle="Peça ao seu professor o código da turma (ex.: ABC-1234)."
    >
      <ErrorBox message={error} />
      <form onSubmit={handleSubmit} className="form-grid">
        <div className="input-group">
          <label className="input-label" htmlFor="reg-code">Código da turma *</label>
          <input
            id="reg-code"
            className="input input--code"
            placeholder="ABC-1234"
            value={form.classCode}
            onChange={(e) => update('classCode', e.target.value.toUpperCase())}
            autoComplete="off"
            required
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="reg-name">Nome completo *</label>
          <input id="reg-name" className="input" value={form.name} onChange={(e) => update('name', e.target.value)} autoComplete="name" required />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="reg-email">E-mail *</label>
          <p className="input-hint">Use o mesmo e-mail que o professor tem na lista da turma, se houver.</p>
          <input id="reg-email" type="email" className="input" value={form.email} onChange={(e) => update('email', e.target.value)} autoComplete="email" required />
        </div>
        <div className="form-row">
          <div className="input-group">
            <label className="input-label" htmlFor="reg-password">Senha *</label>
            <input id="reg-password" type="password" className="input" value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" required />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="reg-confirm">Confirmar senha *</label>
            <input id="reg-confirm" type="password" className="input" value={form.confirm} onChange={(e) => update('confirm', e.target.value)} autoComplete="new-password" required />
          </div>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={loading} className="ui-btn--full" id="btn-student-register">
          {loading ? 'Cadastrando...' : 'Criar conta e entrar na turma'}
        </Button>
      </form>

      <GoogleSignInButton
        label="Cadastrar com Google"
        onToken={async (idToken) => {
          if (!form.classCode.trim()) {
            setError('Digite o código da turma antes de continuar com o Google.');
            return;
          }
          await loginStudentWithGoogle(idToken, form.classCode.trim());
          navigate('/aluno', { replace: true });
        }}
        onError={setError}
      />

      <div className="auth-split__footer-link">
        Já tem conta? <Link to="/aluno/entrar">Entrar</Link>
      </div>
    </StudentShell>
  );
}
