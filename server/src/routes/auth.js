import { Router } from 'express';
import {
  createTeacher,
  getTeacherByEmail,
  getTeacherById,
  getDb,
} from '../database/db.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  unusablePasswordHash,
} from '../services/auth.js';
import { verifyFirebaseIdToken, FirebaseAuthError, isFirebaseConfigured } from '../services/firebaseAuth.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register
 * Cadastra um novo professor.
 * Endurecimento: authLimiter e senha mínima de 8 caracteres.
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Todos os campos são obrigatórios: nome, e-mail e senha.',
      });
    }

    const trimmedName = String(name).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    if (trimmedName.length < 2) {
      return res.status(400).json({
        error: 'O nome deve ter pelo menos 2 caracteres.',
      });
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Informe um endereço de e-mail válido.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'A senha deve ter pelo menos 8 caracteres.',
      });
    }

    const existing = getTeacherByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({
        error: 'Este endereço de e-mail já está cadastrado.',
      });
    }

    const passwordHash = await hashPassword(password);
    const teacher = createTeacher({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
    });

    const token = generateToken(teacher);

    res.status(201).json({
      message: 'Professor cadastrado com sucesso!',
      teacher: {
        id: Number(teacher.id),
        name: teacher.name,
        email: teacher.email,
      },
      token,
    });
  } catch (err) {
    console.error('Erro no registro de professor:', err);
    res.status(500).json({ error: 'Erro interno ao cadastrar professor.' });
  }
});

/**
 * POST /api/auth/login
 * Autentica o professor por email e senha.
 * Endurecimento: authLimiter para mitigação de ataques de força bruta.
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Informe e-mail e senha para entrar.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const teacher = getTeacherByEmail(normalizedEmail);

    if (!teacher) {
      return res.status(401).json({
        error: 'E-mail ou senha incorretos.',
      });
    }

    const passwordMatches = await comparePassword(password, teacher.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({
        error: 'E-mail ou senha incorretos.',
      });
    }

    const teacherData = {
      id: Number(teacher.id),
      name: teacher.name,
      email: teacher.email,
    };
    const token = generateToken(teacherData);

    res.json({
      message: 'Login realizado com sucesso!',
      teacher: teacherData,
      token,
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
});

/**
 * GET /api/auth/me
 * Retorna os dados do professor autenticado a partir do token.
 */
router.get('/me', requireAuth, (req, res) => {
  try {
    const teacher = getTeacherById(req.teacher.id);
    if (!teacher) {
      return res.status(404).json({ error: 'Professor não encontrado.' });
    }

    res.json({
      teacher: {
        id: Number(teacher.id),
        name: teacher.name,
        email: teacher.email,
        createdAt: teacher.created_at,
        role: teacher.role || 'teacher',
        organization: teacher.organization_id
          ? { id: Number(teacher.organization_id), name: teacher.organization_name }
          : null,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    res.status(500).json({ error: 'Erro interno ao buscar perfil.' });
  }
});

/**
 * POST /api/auth/password
 * Troca a senha do professor (ex.: a senha provisória criada pela instituição).
 * Body: { currentPassword, newPassword }
 */
router.post('/password', requireAuth, authLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
    }
    const row = getDb().prepare('SELECT password_hash FROM teachers WHERE id = ?').get(req.teacher.id);
    if (!row || typeof currentPassword !== 'string' || !(await comparePassword(currentPassword, row.password_hash))) {
      return res.status(401).json({ error: 'A senha atual está incorreta.' });
    }
    getDb().prepare('UPDATE teachers SET password_hash = ?, session_epoch = session_epoch + 1 WHERE id = ?')
      .run(await hashPassword(newPassword), req.teacher.id);
    // Outras sessões abertas saem; esta recebe um token novo
    res.json({ message: 'Senha alterada com sucesso.', token: generateToken(req.teacher) });
  } catch (err) {
    console.error('Erro ao trocar senha:', err);
    res.status(500).json({ error: 'Erro interno ao trocar a senha.' });
  }
});

/**
 * GET /api/auth/providers
 * Informa se o login com Google (Firebase) está configurado no servidor.
 */
router.get('/providers', (_req, res) => {
  res.json({ google: isFirebaseConfigured() });
});

/**
 * POST /api/auth/google
 * Login (ou cadastro) de professor com Google via Firebase Authentication.
 * Body: { idToken } — o ID token que o SDK do Firebase devolveu no navegador.
 */
router.post('/google', authLimiter, async (req, res) => {
  try {
    const identity = await verifyFirebaseIdToken(req.body?.idToken);
    const db = getDb();

    let teacher = db.prepare('SELECT * FROM teachers WHERE google_uid = ?').get(identity.uid);
    let created = false;
    let linked = false;

    if (!teacher) {
      teacher = getTeacherByEmail(identity.email);
      if (teacher && teacher.google_uid) {
        return res.status(409).json({ error: 'Este e-mail já está ligado a outra conta Google.' });
      }
      if (teacher) {
        // E-mail verificado pelo Google: liga a conta existente ao login com Google.
        // A senha antiga deixa de valer, porque quem criou a conta pode não ser o dono do e-mail.
        db.prepare('UPDATE teachers SET google_uid = ?, password_hash = ?, session_epoch = session_epoch + 1 WHERE id = ? AND google_uid IS NULL')
          .run(identity.uid, await unusablePasswordHash(), teacher.id);
        linked = true;
      } else {
        const createdTeacher = createTeacher({
          name: identity.name,
          email: identity.email,
          passwordHash: await unusablePasswordHash(),
          googleUid: identity.uid,
        });
        teacher = { ...createdTeacher };
        created = true;
      }
    }

    const teacherData = { id: Number(teacher.id), name: teacher.name, email: teacher.email };
    res.status(created ? 201 : 200).json({
      message: created
        ? 'Conta criada com Google!'
        : linked
          ? 'Sua conta agora entra com o Google.'
          : 'Login realizado com sucesso!',
      teacher: teacherData,
      token: generateToken(teacherData),
    });
  } catch (err) {
    if (err instanceof FirebaseAuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Erro no login com Google:', err);
    res.status(500).json({ error: 'Erro interno ao entrar com Google.' });
  }
});

export default router;
