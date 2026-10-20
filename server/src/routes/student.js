/**
 * Portal do aluno (montado em /api/student com requireStudent).
 * O aluno só vê as turmas em que entrou e a PRÓPRIA entrega de cada atividade.
 * Feedback, nota e correção aparecem somente depois que o professor aprova.
 */
import { Router } from 'express';
import {
  getStudentAccount,
  listStudentClasses,
  listStudentActivities,
  getClassByJoinCode,
  joinClass,
} from '../database/accounts.js';
import { normalizeJoinCode } from '../services/secrets.js';
import { parseOptions } from '../services/objective.js';
import { studentAuthLimiter } from '../middleware/rateLimit.js';
import { getDb } from '../database/db.js';
import { comparePassword, hashPassword, generateStudentToken } from '../services/auth.js';

const router = Router();

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toPortalActivity(row) {
  let situation = 'sem_entrega';
  if (row.response_id) situation = row.feedback_status === 'aprovado' ? 'corrigida' : 'em_correcao';

  const isObjective = row.question_type === 'objetiva';
  const criteria = parseJson(row.criteria_scores);
  return {
    id: row.id,
    title: row.title,
    subject: row.subject || 'Sem disciplina',
    question: row.question,
    questionType: isObjective ? 'objetiva' : 'dissertativa',
    options: isObjective ? parseOptions(row.options) : [],
    dueDate: row.due_date,
    classId: row.class_id,
    className: row.class_name,
    teacherName: row.teacher_name,
    situation,
    myAnswer: row.original_response ?? null,
    feedback: row.feedback ?? null,
    grade: row.grade ?? null,
    criteria: Array.isArray(criteria) ? criteria.map((c) => ({ criterio: c.criterio, atendido: Boolean(c.atendido) })) : [],
    objectiveResult: parseJson(row.auto_result),
    approvedAt: row.approved_at ?? null,
  };
}

function summarizeSubjects(activities) {
  const bySubject = new Map();
  for (const a of activities) {
    const entry = bySubject.get(a.subject) || { subject: a.subject, activities: 0, corrected: 0, grades: [] };
    entry.activities++;
    if (a.situation === 'corrigida') entry.corrected++;
    if (typeof a.grade === 'number') entry.grades.push(a.grade);
    bySubject.set(a.subject, entry);
  }
  return [...bySubject.values()]
    .map(({ grades, ...rest }) => ({
      ...rest,
      gradesCount: grades.length,
      // Média simples das notas que o professor lançou (a IA não participa)
      average: grades.length ? Math.round((grades.reduce((s, g) => s + g, 0) / grades.length) * 10) / 10 : null,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'));
}

/** GET /api/student/me */
router.get('/me', (req, res) => {
  const account = getStudentAccount(req.student.id);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json({
    student: { id: account.id, name: account.name, email: account.email },
    classes: listStudentClasses(account.id),
  });
});

/** POST /api/student/join — Body: { classCode } */
router.post('/join', studentAuthLimiter, (req, res) => {
  try {
    const code = normalizeJoinCode(req.body?.classCode);
    const cls = code ? getClassByJoinCode(code) : null;
    if (!cls) {
      return res.status(404).json({ error: 'Código de turma não encontrado. Confira com seu professor.' });
    }
    const result = joinClass(req.student.id, cls.id);
    res.status(result.alreadyMember ? 200 : 201).json({
      message: result.alreadyMember ? `Você já está na turma ${cls.name}.` : `Você entrou na turma ${cls.name}!`,
      class: { id: cls.id, name: cls.name, teacher_name: cls.teacher_name },
    });
  } catch (err) {
    console.error('Erro ao entrar na turma:', err);
    res.status(500).json({ error: 'Erro interno ao entrar na turma.' });
  }
});

/**
 * POST /api/student/password — troca a senha (ex.: a senha provisória criada pela instituição).
 * Body: { currentPassword, newPassword }
 */
router.post('/password', studentAuthLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
    }
    const row = getDb().prepare('SELECT password_hash FROM student_accounts WHERE id = ?').get(req.student.id);
    if (!row || typeof currentPassword !== 'string' || !(await comparePassword(currentPassword, row.password_hash))) {
      return res.status(401).json({ error: 'A senha atual está incorreta.' });
    }
    getDb().prepare('UPDATE student_accounts SET password_hash = ?, session_epoch = session_epoch + 1 WHERE id = ?')
      .run(await hashPassword(newPassword), req.student.id);
    // Outras sessões abertas saem; esta recebe um token novo
    res.json({ message: 'Senha alterada com sucesso.', token: generateStudentToken(req.student) });
  } catch (err) {
    console.error('Erro ao trocar senha do aluno:', err);
    res.status(500).json({ error: 'Erro interno ao trocar a senha.' });
  }
});

/** GET /api/student/activities */
router.get('/activities', (req, res) => {
  try {
    const activities = listStudentActivities(req.student.id).map(toPortalActivity);
    res.json({ subjects: summarizeSubjects(activities), activities });
  } catch (err) {
    console.error('Erro ao listar atividades do aluno:', err);
    res.status(500).json({ error: 'Erro interno ao carregar suas atividades.' });
  }
});

export default router;
