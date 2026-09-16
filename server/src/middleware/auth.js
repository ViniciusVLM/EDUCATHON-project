import { verifyToken } from '../services/auth.js';

/**
 * Middleware para exigir autenticação via JWT.
 * Espera header: Authorization: Bearer <token>
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Acesso não autorizado. Token ausente ou formato inválido.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyToken(token);
    req.teacher = {
      id: Number(payload.id),
      name: payload.name,
      email: payload.email,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token de autenticação inválido.' });
  }
}

/**
 * Middleware opcional de autenticação.
 * Anexa req.teacher se houver um token válido, mas não bloqueia a requisição caso ausente.
 */
export function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const payload = verifyToken(token);
      req.teacher = {
        id: Number(payload.id),
        name: payload.name,
        email: payload.email,
      };
    } catch {
      // Ignora erro de token inválido em rotas opcionais
    }
  }

  next();
}
