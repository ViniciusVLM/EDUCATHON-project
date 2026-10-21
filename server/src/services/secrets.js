/**
 * Criptografia das chaves do Gemini cadastradas por professores e instituições.
 *
 * AES-256-GCM com chave derivada de ENCRYPTION_KEY (recomendado) ou, na falta dela,
 * do JWT_SECRET. A chave em texto puro nunca é devolvida ao navegador: só os 4 últimos caracteres.
 */
import crypto from 'node:crypto';

const VERSION = 'v1';
let warned = false;

function getEncryptionKey() {
  const explicit = process.env.ENCRYPTION_KEY;
  if (explicit && explicit.length >= 32) {
    return Buffer.from(crypto.hkdfSync('sha256', explicit, 'educathon', 'chave-gemini', 32));
  }
  if (!warned && process.env.NODE_ENV !== 'test') {
    console.warn(
      '⚠️ ENCRYPTION_KEY não definido: as chaves do Gemini dos usuários serão protegidas com uma chave derivada do JWT_SECRET.\n' +
      '  Em produção, defina ENCRYPTION_KEY (64 caracteres hexadecimais) e guarde-o fora do banco.'
    );
    warned = true;
  }
  const base = process.env.JWT_SECRET || 'segredo-somente-para-testes';
  return Buffer.from(crypto.hkdfSync('sha256', base, 'educathon', 'chave-gemini-derivada', 32));
}

export function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

/** Devolve o texto original ou null se o valor estiver corrompido ou a chave de criptografia mudou. */
export function decryptSecret(stored) {
  if (typeof stored !== 'string') return null;
  const [version, ivB64, tagB64, dataB64] = stored.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function lastFour(value) {
  return String(value || '').trim().slice(-4);
}

/** Senha provisória legível (sem 0/O, 1/l) para acessos criados pela instituição. */
export function generateTempPassword(length = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Código de turma no formato ABC-1234 (sem caracteres ambíguos). */
export function generateJoinCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const bytes = crypto.randomBytes(7);
  let code = '';
  for (let i = 0; i < 3; i++) code += letters[bytes[i] % letters.length];
  code += '-';
  for (let i = 3; i < 7; i++) code += digits[bytes[i] % digits.length];
  return code;
}

export function normalizeJoinCode(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 7) return null;
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}
