/**
 * Área da instituição (montada em /api/org com requireAuth).
 *
 * O administrador vê professores, turmas, alunos com conta e o uso de IA, cria acessos e
 * gera códigos de turma. Por minimização de dados (LGPD), ele NÃO vê respostas nem feedbacks.
 */
import { Router } from 'express';
import { createTeacher, getTeacherByEmail, getTeacherById } from '../database/db.js';
import {
  createOrganizationForTeacher,
  getOrganization,
  listOrgTeachers,
  listOrgClasses,
  listOrgStudentAccounts,
  getOrgClass,
  getOrgTeacher,
  removeTeacherFromOrg,
  rotateJoinCode,
  createStudentAccount,
  getStudentAccountByEmail,
  joinClass,
} from '../database/accounts.js';
import { requireOrgAdmin } from '../middleware/auth.js';
import { hashPassword } from '../services/auth.js';
import { generateTempPassword } from '../services/secrets.js';
import { getQuotaStatus } from '../services/plans.js';

const router = Router();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePerson(body) {
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 120) return { error: 'Informe o nome (2 a 120 caracteres).' };
  if (!EMAIL_REGEX.test(email) || email.length > 200) return { error: 'Informe um e-mail válido.' };
  return { name, email };
}

/**
 * POST /api/org
 * Cria uma instituição; quem cria vira administrador. Body: { name }
 */
router.post('/', (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ error: 'Informe o nome da instituição (2 a 120 caracteres).' });
    }
    const teacher = getTeacherById(req.teacher.id);
    if (teacher?.organization_id) {
      return res.status(409).json({ error: 'Você já faz parte de uma instituição.' });
    }
    const org = createOrganizationForTeacher(req.teacher.id, name);
    res.status(201).json({ message: `Instituição ${org.name} criada! Você é o administrador.`, organization: org });
  } catch (err) {
    console.error('Erro ao criar instituição:', err);
    res.status(500).json({ error: 'Erro interno ao criar instituição.' });
  }
});

/**
 * GET /api/org
 * Visão geral da instituição para o administrador.
 */
router.get('/', requireOrgAdmin, (req, res) => {
  try {
    const org = getOrganization(req.organizationId);
    const teachers = listOrgTeachers(req.organizationId);
    const classes = listOrgClasses(req.organizationId);
    const students = listOrgStudentAccounts(req.organizationId);
    res.json({
      organization: org,
      quota: getQuotaStatus(req.teacher.id),
      totals: {
        teachers: teachers.length,
        classes: classes.length,
        studentsOnRoster: classes.reduce((s, c) => s + c.student_count, 0),
        studentAccounts: new Set(students.map((s) => s.id)).size,
      },
      teachers,
      classes,
      students,
    });
  } catch (err) {
    console.error('Erro ao carregar instituição:', err);
    res.status(500).json({ error: 'Erro interno ao carregar a instituição.' });
  }
});

/**
 * POST /api/org/teachers
 * Cria o acesso de um professor na instituição. Body: { name, email }
 * Devolve uma senha provisória UMA vez, para o administrador repassar.
 */
router.post('/teachers', requireOrgAdmin, async (req, res) => {
  try {
    const person = validatePerson(req.body);
    if (person.error) return res.status(400).json({ error: person.error });
    if (getTeacherByEmail(person.email)) {
      return res.status(409).json({ error: 'Já existe uma conta de professor com esse e-mail.' });
    }
    const tempPassword = generateTempPassword();
    const teacher = createTeacher({
      name: person.name,
      email: person.email,
      passwordHash: await hashPassword(tempPassword),
      organizationId: req.organizationId,
    });
    res.status(201).json({
      message: `Acesso criado para ${teacher.name}.`,
      teacher: { id: Number(teacher.id), name: teacher.name, email: teacher.email },
      tempPassword,
    });
  } catch (err) {
    console.error('Erro ao criar professor na instituição:', err);
    res.status(500).json({ error: 'Erro interno ao criar o acesso.' });
  }
});

/**
 * DELETE /api/org/teachers/:id
 * Tira o professor da instituição (a conta e as turmas dele continuam existindo).
 */
router.delete('/teachers/:id', requireOrgAdmin, (req, res) => {
  const teacherId = Number(req.params.id);
  if (teacherId === req.teacher.id) {
    return res.status(400).json({ error: 'Você não pode remover a si mesmo da instituição.' });
  }
  const teacher = getOrgTeacher(req.organizationId, teacherId);
  if (!teacher) return res.status(404).json({ error: 'Professor não encontrado nesta instituição.' });
  removeTeacherFromOrg(req.organizationId, teacherId);
  res.json({ message: `${teacher.name} foi removido(a) da instituição.` });
});

/**
 * POST /api/org/students
 * Cria o acesso de um aluno e coloca na turma. Body: { name, email, classId }
 * Se o e-mail já tiver conta de aluno, recusa (o aluno entra pelo código da turma).
 */
router.post('/students', requireOrgAdmin, async (req, res) => {
  try {
    const person = validatePerson(req.body);
    if (person.error) return res.status(400).json({ error: person.error });
    const cls = getOrgClass(req.organizationId, Number(req.body?.classId));
    if (!cls) return res.status(404).json({ error: 'Turma não encontrada nesta instituição.' });

    if (getStudentAccountByEmail(person.email)) {
      return res.status(409).json({
        error: 'Já existe uma conta de aluno com esse e-mail. Passe o código da turma para o aluno entrar por conta própria.',
      });
    }

    const tempPassword = generateTempPassword();
    const account = createStudentAccount({
      name: person.name,
      email: person.email,
      passwordHash: await hashPassword(tempPassword),
      // A instituição conhece o aluno e o e-mail: o acesso pode ser ligado à lista da turma.
      emailVerified: true,
    });
    joinClass(account.id, cls.id);
    res.status(201).json({
      message: `Acesso criado para ${account.name} na turma ${cls.name}.`,
      student: account,
      tempPassword,
    });
  } catch (err) {
    console.error('Erro ao criar aluno na instituição:', err);
    res.status(500).json({ error: 'Erro interno ao criar o acesso do aluno.' });
  }
});

/**
 * POST /api/org/classes/:id/join-code
 * Gera (ou troca) o código de qualquer turma da instituição.
 */
router.post('/classes/:id/join-code', requireOrgAdmin, (req, res) => {
  const cls = getOrgClass(req.organizationId, Number(req.params.id));
  if (!cls) return res.status(404).json({ error: 'Turma não encontrada nesta instituição.' });
  const code = rotateJoinCode(cls.id);
  res.json({ message: 'Código da turma gerado.', joinCode: code });
});

export default router;
