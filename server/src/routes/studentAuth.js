/**
 * Acesso do aluno: cadastro com o código da turma, login com e-mail e senha e login com Google.
 * Montada em /api/student-auth (pública, com limite de tentativas).
 */
import { Router } from 'express';
import {
  createStudentAccount,
  getStudentAccountByEmail,
  getStudentAccountByGoogleUid,
  linkStudentGoogle,
  relinkVerifiedAccount,
  getClassByJoinCode,
  joinClass,
} from '../database/accounts.js';
import { hashPassword, comparePassword, generateStudentToken, unusablePasswordHash } from '../services/auth.js';
import { normalizeJoinCode } from '../services/secrets.js';
import { verifyFirebaseIdToken, FirebaseAuthError } from '../services/firebaseAuth.js';
import { studentAuthLimiter } from '../middleware/rateLimit.js';

const router = Router();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function findClass(code) {
  const normalized = normalizeJoinCode(code);
  return normalized ? getClassByJoinCode(normalized) : null;
}

function respond(res, status, account, message, joinedClass = null) {
  const student = { id: Number(account.id), name: account.name, email: account.email };
  res.status(status).json({
    message,
    student,
    token: generateStudentToken(student),
    joinedClass: joinedClass ? { id: joinedClass.id, name: joinedClass.name } : null,
  });
}

/**
 * POST /api/student-auth/register
 * Body: { name, email, password, classCode }
 */
router.post('/register', studentAuthLimiter, async (req, res) => {
  try {
    const { name, email, password, classCode } = req.body || {};
    if (!name || !email || !password || !classCode) {
      return res.status(400).json({ error: 'Preencha nome, e-mail, senha e o código da turma.' });
    }
    const trimmedName = String(name).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    if (trimmedName.length < 2 || trimmedName.length > 120) {
      return res.status(400).json({ error: 'O nome deve ter entre 2 e 120 caracteres.' });
    }
    if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 200) {
      return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
    }

    const cls = findClass(classCode);
    if (!cls) {
      return res.status(404).json({ error: 'Código de turma não encontrado. Confira com seu professor.' });
    }
    if (getStudentAccountByEmail(normalizedEmail)) {
      return res.status(409).json({ error: 'Este e-mail já tem cadastro. Entre com sua senha e use o código para entrar na turma.' });
    }

    const account = createStudentAccount({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
    });
    joinClass(account.id, cls.id);

    respond(res, 201, account, `Bem-vindo(a)! Você entrou na turma ${cls.name}.`, cls);
  } catch (err) {
    console.error('Erro no cadastro de aluno:', err);
    res.status(500).json({ error: 'Erro interno ao cadastrar aluno.' });
  }
});

/**
 * POST /api/student-auth/login
 * Body: { email, password }
 */
router.post('/login', studentAuthLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha para entrar.' });
    }
    const account = getStudentAccountByEmail(String(email));
    if (!account || !(await comparePassword(String(password), account.password_hash))) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    respond(res, 200, account, 'Login realizado com sucesso!');
  } catch (err) {
    console.error('Erro no login de aluno:', err);
    res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
});

/**
 * POST /api/student-auth/google
 * Body: { idToken, classCode? } — o código é obrigatório só no primeiro acesso.
 */
router.post('/google', studentAuthLimiter, async (req, res) => {
  try {
    const identity = await verifyFirebaseIdToken(req.body?.idToken);
    const classCode = req.body?.classCode;
    const cls = classCode ? findClass(classCode) : null;
    if (classCode && !cls) {
      return res.status(404).json({ error: 'Código de turma não encontrado. Confira com seu professor.' });
    }

    let account = getStudentAccountByGoogleUid(identity.uid);
    let status = 200;
    let message = 'Login realizado com sucesso!';
    if (!account) {
      const byEmail = getStudentAccountByEmail(identity.email);
      if (byEmail && byEmail.google_uid) {
        return res.status(409).json({ error: 'Este e-mail já está ligado a outra conta Google.' });
      }
      if (byEmail) {
        // A partir de agora a conta entra só com o Google: a senha antiga (que pode ter sido criada
        // por outra pessoa com este e-mail) deixa de valer.
        linkStudentGoogle(byEmail.id, identity.uid, await unusablePasswordHash());
        relinkVerifiedAccount(byEmail.id);
        account = byEmail;
        message = 'Sua conta agora entra com o Google.';
      }
    }

    if (!account) {
      if (!cls) {
        return res.status(400).json({
          error: 'Primeiro acesso: digite o código da turma que seu professor passou.',
          needsClassCode: true,
        });
      }
      account = createStudentAccount({
        name: identity.name,
        email: identity.email,
        passwordHash: await unusablePasswordHash(),
        googleUid: identity.uid,
        emailVerified: true,
      });
      status = 201;
    }

    if (cls) joinClass(account.id, cls.id);
    respond(res, status, account, message, cls);
  } catch (err) {
    if (err instanceof FirebaseAuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Erro no login de aluno com Google:', err);
    res.status(500).json({ error: 'Erro interno ao entrar com Google.' });
  }
});

export default router;
