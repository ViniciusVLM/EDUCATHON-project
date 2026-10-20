/**
 * Verificação do "Login com Google" feito pelo Firebase Authentication.
 *
 * O navegador entra com o Google pelo SDK do Firebase e envia o ID token para o servidor.
 * Aqui o token é conferido com os certificados públicos do Google, como a documentação do
 * Firebase orienta para bibliotecas JWT de terceiros (sem precisar do firebase-admin):
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
import jwt from 'jsonwebtoken';

const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export class FirebaseAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'FirebaseAuthError';
    this.status = status;
  }
}

let cache = { certs: null, expiresAt: 0 };

async function defaultFetcher() {
  const response = await fetch(CERTS_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status} ao buscar certificados do Google`);
  const maxAge = Number((response.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1]) || 3600;
  return { certs: await response.json(), maxAgeSeconds: maxAge };
}

let fetcher = defaultFetcher;

/** Para testes: injeta certificados falsos. */
export function setCertFetcher(fn) {
  fetcher = fn || defaultFetcher;
  cache = { certs: null, expiresAt: 0 };
  lastFetchAt = 0;
}

export function isFirebaseConfigured() {
  return Boolean(process.env.FIREBASE_PROJECT_ID);
}

let lastFetchAt = 0;

async function getCerts(force = false) {
  const fresh = cache.certs && Date.now() < cache.expiresAt;
  // Um "kid" desconhecido força nova busca, mas no máximo uma vez por minuto
  // (evita que tokens inventados façam o servidor bater no Google sem parar).
  if (fresh && (!force || Date.now() - lastFetchAt < 60_000)) return cache.certs;
  const { certs, maxAgeSeconds } = await fetcher();
  lastFetchAt = Date.now();
  cache = { certs, expiresAt: Date.now() + maxAgeSeconds * 1000 };
  return certs;
}

/**
 * @param {string} idToken
 * @returns {Promise<{uid: string, email: string, name: string}>}
 */
export async function verifyFirebaseIdToken(idToken) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new FirebaseAuthError('O login com Google não está configurado neste servidor.', 503);
  }
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) {
    throw new FirebaseAuthError('Token do Google inválido.');
  }

  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded?.header?.kid;
  if (!decoded || decoded.header.alg !== 'RS256' || !kid) {
    throw new FirebaseAuthError('Token do Google inválido.');
  }

  let certs;
  try {
    certs = await getCerts();
    if (!certs[kid]) certs = await getCerts(true);
  } catch (err) {
    console.error('Erro ao buscar certificados do Firebase:', err.message);
    throw new FirebaseAuthError('Não foi possível validar o login com Google agora. Tente de novo.', 503);
  }
  const cert = certs[kid];
  if (!cert) throw new FirebaseAuthError('Token do Google inválido.');

  let payload;
  try {
    payload = jwt.verify(idToken, cert, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new FirebaseAuthError('O login com Google expirou. Tente de novo.');
    }
    throw new FirebaseAuthError('Token do Google inválido.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new FirebaseAuthError('Token do Google inválido.');
  }
  if (typeof payload.auth_time === 'number' && payload.auth_time > nowSeconds + 60) {
    throw new FirebaseAuthError('Token do Google inválido.');
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new FirebaseAuthError('Sua conta Google precisa ter um e-mail verificado.', 403);
  }

  const email = String(payload.email).toLowerCase();
  return {
    uid: payload.sub,
    email,
    name: (payload.name && String(payload.name).slice(0, 120)) || email.split('@')[0],
  };
}
