import { Router } from 'express';
import {
  createTeacher,
  getTeacherByEmail,
  getTeacherById,
} from '../database/db.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
} from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register
 * Cadastra um novo professor.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Todos os campos são obrigatórios: nome, e-mail e senha.',
      });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

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

    if (password.length < 6) {
      return res.status(400).json({
        error: 'A senha deve ter pelo menos 6 caracteres.',
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
 */
router.post('/login', async (req, res) => {
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
      },
    });
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    res.status(500).json({ error: 'Erro interno ao buscar perfil.' });
  }
});

export default router;
