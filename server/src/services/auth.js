import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const isTest =
  process.env.NODE_ENV === 'test' ||
  process.execArgv.includes('--test') ||
  process.env.NODE_TEST_CONTEXT !== undefined;

export const JWT_EXAMPLE_VALUE = 'substitua_por_um_valor_aleatorio_forte_de_64_caracteres';

/**
 * Valida o segredo JWT para garantir que não seja fraco nem um placeholder.
 * Fora do ambiente de teste, recusa iniciar se:
 * - estiver ausente;
 * - tiver menos de 32 caracteres;
 * - for igual ao valor do .env.example ou contiver "substitua" ou "your_".
 *
 * @param {string} [secret=process.env.JWT_SECRET]
 * @param {boolean} [inTestEnv=isTest]
 * @returns {string} O segredo validado
 */
export function validateJwtSecret(secret = process.env.JWT_SECRET, inTestEnv = isTest) {
  if (inTestEnv && !secret) {
    return 'segredo-somente-para-testes';
  }

  if (!secret) {
    throw new Error(
      '❌ JWT_SECRET não definido. Gere um valor forte (mínimo 32 caracteres) e adicione ao .env:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
      'Nunca use um valor padrão fixo — qualquer pessoa que veja o código pode forjar tokens.'
    );
  }

  const isPlaceholder =
    secret === JWT_EXAMPLE_VALUE ||
    secret.includes('substitua') ||
    secret.includes('your_');

  if (secret.length < 32 || isPlaceholder) {
    if (!inTestEnv) {
      throw new Error(
        '❌ JWT_SECRET inseguro. O segredo deve ter pelo menos 32 caracteres e não pode ser um valor de exemplo/placeholder (contendo "substitua" ou "your_").\n' +
        'Gere um segredo forte de 64 caracteres hexadecimais com:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
  }

  return secret;
}

// Executa a validação fora do ambiente de testes
if (!isTest) {
  validateJwtSecret(process.env.JWT_SECRET, false);
}

export const JWT_SECRET = process.env.JWT_SECRET || 'segredo-somente-para-testes';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || (isTest ? 4 : 12);


/**
 * Gera o hash de uma senha em texto plano.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compara uma senha em texto plano com um hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Gera um token JWT para um professor.
 * @param {{ id: number, name: string, email: string }} teacher
 * @returns {string}
 */
export function generateToken(teacher) {
  return jwt.sign(
    {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Decodifica e valida um token JWT.
 * @param {string} token
 * @returns {{ id: number, name: string, email: string }}
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
