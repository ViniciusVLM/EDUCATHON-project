import { Router } from 'express';
import {
  createActivity,
  getActivityIfOwned,
  getAllActivities,
  getResponsesByActivity,
  getActivityStats,
  getClassById,
} from '../database/db.js';
import { validateExtraQuestions } from '../services/multiQuestion.js';

const router = Router();

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Valida alternativas de questão objetiva: 2 a 6 itens com texto, letras A–F em ordem.
 */
function validateObjective(rawOptions, rawCorrect) {
  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > LETTERS.length) {
    return { error: 'A questão objetiva precisa de 2 a 6 alternativas.' };
  }
  const options = [];
  for (let i = 0; i < rawOptions.length; i++) {
    const item = rawOptions[i];
    const texto = typeof item === 'string' ? item : item?.texto;
    if (typeof texto !== 'string' || !texto.trim()) {
      return { error: `Preencha o texto da alternativa ${LETTERS[i]}.` };
    }
    if (texto.trim().length > 500) {
      return { error: `A alternativa ${LETTERS[i]} deve ter no máximo 500 caracteres.` };
    }
    options.push({ letra: LETTERS[i], texto: texto.trim() });
  }
  const correctOption = String(rawCorrect || '').trim().toUpperCase();
  if (!options.some((o) => o.letra === correctOption)) {
    return { error: 'Marque qual alternativa é a correta (gabarito).' };
  }
  return { options, correctOption };
}

/**
 * POST /api/activities
 * Cria uma nova atividade de correção.
 */
router.post('/', (req, res) => {
  try {
    const { title, question, educationLevel, subject, classId, dueDate, rubricCriteria } = req.body;
    let { rubric } = req.body;
    const questionType = req.body.questionType === 'objetiva' ? 'objetiva' : 'dissertativa';

    // Questão objetiva: alternativas + gabarito. A justificativa (rubric) é opcional.
    let options = null;
    let correctOption = null;
    if (questionType === 'objetiva') {
      const parsed = validateObjective(req.body.options, req.body.correctOption);
      if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
      }
      options = parsed.options;
      correctOption = parsed.correctOption;
      if (!rubric || typeof rubric !== 'string' || !rubric.trim()) {
        rubric = `Gabarito: alternativa ${correctOption}.`;
      }
    }

    if (!title || typeof title !== 'string' || !title.trim() ||
        !question || typeof question !== 'string' || !question.trim() ||
        !rubric || typeof rubric !== 'string' || !rubric.trim()) {
      return res.status(400).json({
        error: 'Campos obrigatórios: title, question, rubric',
      });
    }

    if (title.trim().length > 200) {
      return res.status(400).json({
        error: 'O título deve ter no máximo 200 caracteres.',
      });
    }

    if (question.trim().length > 2000) {
      return res.status(400).json({
        error: 'A pergunta deve ter no máximo 2000 caracteres.',
      });
    }

    if (rubric.trim().length > 4000) {
      return res.status(400).json({
        error: 'A rubrica deve ter no máximo 4000 caracteres.',
      });
    }

    if (subject && String(subject).trim().length > 100) {
      return res.status(400).json({
        error: 'A disciplina deve ter no máximo 100 caracteres.',
      });
    }

    if (rubricCriteria && Array.isArray(rubricCriteria) && rubricCriteria.length > 20) {
      return res.status(400).json({
        error: 'O limite é de 20 critérios de rubrica por atividade.',
      });
    }

    // Várias questões dissertativas: a pergunta 1 é question/rubric, as demais vêm em extraQuestions
    let questions = null;
    if (questionType === 'dissertativa') {
      const parsedQuestions = validateExtraQuestions(req.body.extraQuestions, { question, rubric });
      if (parsedQuestions.error) {
        return res.status(400).json({ error: parsedQuestions.error });
      }
      questions = parsedQuestions.questions;
    }

    // IDOR fix: se informado classId, valida se a turma pertence ao professor logado
    if (classId) {
      const cls = getClassById(Number(classId), req.teacher.id);
      if (!cls) {
        return res.status(404).json({ error: 'Turma não encontrada.' });
      }
    }

    const result = createActivity({
      title,
      question,
      rubric,
      educationLevel,
      subject,
      classId,
      dueDate,
      rubricCriteria: questionType === 'objetiva' ? null : rubricCriteria,
      teacherId: req.teacher.id,
      questionType,
      options,
      correctOption,
      questions,
    });

    res.status(201).json({
      message: 'Atividade criada com sucesso!',
      id: Number(result.id),
    });
  } catch (error) {
    console.error('Erro ao criar atividade:', error);
    res.status(500).json({ error: 'Erro interno ao criar atividade.' });
  }
});

/**
 * GET /api/activities
 * Lista todas as atividades do professor logado.
 */
router.get('/', (req, res) => {
  try {
    const activities = getAllActivities(req.teacher.id);
    res.json(activities);
  } catch (error) {
    console.error('Erro ao listar atividades:', error);
    res.status(500).json({ error: 'Erro interno ao listar atividades.' });
  }
});

/**
 * GET /api/activities/:id
 * Retorna uma atividade com todas as respostas e feedbacks.
 */
router.get('/:id', (req, res) => {
  try {
    const activity = getActivityIfOwned(Number(req.params.id), req.teacher.id);
    if (!activity) {
      // Retorna 404 tanto para ID inexistente quanto para atividade de outro professor
      // (não revelar a existência de recursos alheios — prevenção de IDOR)
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    const responses = getResponsesByActivity(activity.id);
    const stats = getActivityStats(activity.id);

    res.json({
      ...activity,
      responses,
      stats,
    });
  } catch (error) {
    console.error('Erro ao buscar atividade:', error);
    res.status(500).json({ error: 'Erro interno ao buscar atividade.' });
  }
});

export default router;
