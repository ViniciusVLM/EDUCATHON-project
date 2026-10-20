import { verifyToken, getSessionEpoch } from '../services/auth.js';
import { getDb } from '../database/db.js';

function readBearer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
}

/** Sessão antiga (senha trocada ou conta ligada ao Google depois que o token foi emitido)? */
function isStaleSession(kind, payload) {
  const current = getSessionEpoch(kind, Number(payload.id));
  return current !== null && (payload.ep ?? 0) !== current;
}

function rejectInvalid(res, err) {
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
  return res.status(401).json({ error: 'Token de autenticação inválido.' });
}

/**
 * Middleware para exigir autenticação de PROFESSOR via JWT.
 * Espera header: Authorization: Bearer <token>
 * Tokens de aluno (role: 'student') são recusados com 403.
 */
export function requireAuth(req, res, next) {
  const token = readBearer(req);
  if (!token) {
    return res.status(401).json({
      error: 'Acesso não autorizado. Token ausente ou formato inválido.',
    });
  }

  try {
    const payload = verifyToken(token);
    if (payload.role === 'student') {
      return res.status(403).json({ error: 'Esta área é exclusiva para professores.' });
    }
    if (isStaleSession('teacher', payload)) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    req.teacher = {
      id: Number(payload.id),
      name: payload.name,
      email: payload.email,
    };
    next();
  } catch (err) {
    return rejectInvalid(res, err);
  }
}

/**
 * Middleware para exigir autenticação de ALUNO.
 */
export function requireStudent(req, res, next) {
  const token = readBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'Faça login para ver suas atividades.' });
  }
  try {
    const payload = verifyToken(token);
    if (payload.role !== 'student') {
      return res.status(403).json({ error: 'Esta área é exclusiva para alunos.' });
    }
    if (isStaleSession('student', payload)) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    req.student = { id: Number(payload.id), name: payload.name, email: payload.email };
    next();
  } catch (err) {
    return rejectInvalid(res, err);
  }
}

/**
 * Exige que o professor logado seja administrador de uma instituição.
 * O papel é lido do banco (não do token), para valer na hora em que mudar.
 * Deve vir depois de requireAuth.
 */
export function requireOrgAdmin(req, res, next) {
  const row = getDb()
    .prepare('SELECT role, organization_id FROM teachers WHERE id = ?')
    .get(req.teacher.id);
  if (!row || row.role !== 'org_admin' || !row.organization_id) {
    return res.status(403).json({ error: 'Apenas o administrador da instituição pode fazer isso.' });
  }
  req.organizationId = row.organization_id;
  next();
}

/**
 * Middleware opcional de autenticação.
 * Anexa req.teacher se houver um token válido de professor, mas não bloqueia a requisição caso ausente.
 */
export function optionalAuth(req, _res, next) {
  const token = readBearer(req);
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload.role !== 'student') {
        req.teacher = {
          id: Number(payload.id),
          name: payload.name,
          email: payload.email,
        };
      }
    } catch {
      // Ignora erro de token inválido em rotas opcionais
    }
  }

  next();
}
