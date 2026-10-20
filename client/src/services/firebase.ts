/**
 * Login com Google pelo Firebase Authentication.
 *
 * O SDK só é baixado quando a pessoa clica no botão (import dinâmico), para não pesar o app.
 * Depois do login, o Firebase devolve um ID token que o servidor confere; a sessão do
 * Educathon continua sendo o nosso próprio token, então saímos do Firebase em seguida.
 *
 * A configuração (VITE_FIREBASE_*) é pública por natureza: identifica o projeto, não dá acesso a nada.
 * Proteja o projeto limitando os domínios autorizados no console do Firebase.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function isGoogleLoginEnabled(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

const FRIENDLY_ERRORS: Record<string, string> = {
  'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de terminar.',
  'auth/cancelled-popup-request': 'A janela do Google foi fechada antes de terminar.',
  'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Libere pop-ups para este site e tente de novo.',
  'auth/unauthorized-domain': 'Este endereço ainda não foi autorizado no projeto do Firebase.',
  'auth/network-request-failed': 'Sem conexão com o Google. Verifique a internet e tente de novo.',
};

export async function signInWithGoogleAndGetIdToken(): Promise<string> {
  if (!isGoogleLoginEnabled()) {
    throw new Error('O login com Google não está configurado.');
  }
  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }] = await Promise.all([
    import('@firebase/app'),
    import('@firebase/auth'),
  ]);

  const app = getApps()[0] || initializeApp(config);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const credential = await signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken();
    await signOut(auth).catch(() => undefined);
    return idToken;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    const friendly = new Error(FRIENDLY_ERRORS[code] || 'Não foi possível entrar com o Google agora.');
    (friendly as Error & { cause?: unknown }).cause = err;
    throw friendly;
  }
}
