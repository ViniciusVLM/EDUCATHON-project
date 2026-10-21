import { useState } from 'react';
import { isGoogleLoginEnabled, signInWithGoogleAndGetIdToken } from '../../services/firebase';

interface Props {
  /** Recebe o ID token do Firebase e faz o login no servidor. */
  onToken: (idToken: string) => Promise<void>;
  onError: (message: string) => void;
  label?: string;
}

/** Botão "Entrar com Google". Some quando o Firebase não está configurado. */
export function GoogleSignInButton({ onToken, onError, label = 'Entrar com Google' }: Props) {
  const [loading, setLoading] = useState(false);
  if (!isGoogleLoginEnabled()) return null;

  async function handleClick() {
    setLoading(true);
    try {
      const idToken = await signInWithGoogleAndGetIdToken();
      await onToken(idToken);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Não foi possível entrar com o Google.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="auth-divider" aria-hidden="true"><span>ou</span></div>
      <button type="button" className="google-btn" onClick={handleClick} disabled={loading} id="btn-google">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 7.2-9.6 7.2-16.5z" />
          <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.7 2.2-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
        </svg>
        {loading ? 'Abrindo o Google...' : label}
      </button>
    </>
  );
}
