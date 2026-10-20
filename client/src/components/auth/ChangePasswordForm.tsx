import { useState, FormEvent } from 'react';
import { Button } from '../ui/Button';
import { IconAlertCircle, IconCheckCircle } from '../ui/Icons';

interface Props {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<{ message: string }>;
  idPrefix: string;
}

/** Formulário de troca de senha (professor e aluno). */
export function ChangePasswordForm({ onSubmit, idPrefix }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    if (next.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (next !== confirm) {
      setError('As senhas novas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const res = await onSubmit(current, next);
      setOk(res.message);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid password-form">
      <div className="input-group">
        <label className="input-label" htmlFor={`${idPrefix}-current`}>Senha atual</label>
        <input id={`${idPrefix}-current`} type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </div>
      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor={`${idPrefix}-new`}>Nova senha</label>
          <input id={`${idPrefix}-new`} type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor={`${idPrefix}-confirm`}>Confirmar nova senha</label>
          <input id={`${idPrefix}-confirm`} type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </div>
      </div>
      {error && <div className="alert-box alert-box--error" role="alert"><IconAlertCircle size={18} /><span>{error}</span></div>}
      {ok && <div className="alert-box alert-box--success" role="status"><IconCheckCircle size={18} /><span>{ok} Outras sessões abertas foram encerradas.</span></div>}
      <div>
        <Button type="submit" variant="primary" loading={loading}>Trocar senha</Button>
      </div>
      <p className="input-hint">Se você entra com o Google, não há senha para trocar.</p>
    </form>
  );
}
