import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error(
    '❌ JWT_SECRET não definido. Gere um valor forte e adicione ao .env:\n' +
    '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
    'Nunca use um valor padrão fixo — qualquer pessoa que veja o código pode forjar tokens.'
  );
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';


/**
 * Gera o hash de uma senha em texto plano.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
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
