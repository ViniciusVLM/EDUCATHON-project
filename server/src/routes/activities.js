import { Router } from 'express';
import {
  createActivity,
  getActivityIfOwned,
  getAllActivities,
  getResponsesByActivity,
  getActivityStats,
  getClassById,
  setActivityAiGrade,
  setActivityArchived,
  updateActivityDetails,
} from '../database/db.js';
import { validateExtraQuestions } from '../services/multiQuestion.js';
import { buildActivityInsights } from '../services/insights.js';

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
      // Nota sugerida pela IA: só em dissertativas e só se o professor pedir
      aiGradeEnabled: questionType === 'dissertativa' && req.body.aiGradeEnabled === true,
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
 * PATCH /api/activities/:id/ai-grade
 * Liga ou desliga a nota sugerida pela IA numa atividade dissertativa já criada.
 * Vale para os próximos feedbacks gerados (ou regenerados). Body: { enabled: boolean }
 */
router.patch('/:id/ai-grade', (req, res) => {
  try {
    const activity = getActivityIfOwned(Number(req.params.id), req.teacher.id);
    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ error: 'Envie "enabled" como true ou false.' });
    }
    if (activity.question_type === 'objetiva' && req.body.enabled) {
      return res.status(400).json({ error: 'Em múltipla escolha a correção já é feita pelo gabarito.' });
    }
    setActivityAiGrade(activity.id, req.body.enabled);
    res.json({
      message: req.body.enabled
        ? 'Nota sugerida ligada. Ela aparece nos próximos feedbacks gerados ou regenerados.'
        : 'Nota sugerida desligada.',
      aiGradeEnabled: req.body.enabled,
    });
  } catch (error) {
    console.error('Erro ao alterar nota sugerida:', error);
    res.status(500).json({ error: 'Erro interno ao alterar a configuração.' });
  }
});

function parseJsonOrNull(value) {
  if (!value || typeof value !== 'string') return value || null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * POST /api/activities/:id/duplicate
 * Reaplica a atividade (por exemplo, em outra turma): copia enunciado, rubrica, critérios,
 * alternativas e perguntas extras. Não copia respostas, feedbacks, notas nem o prazo.
 * Body opcional: { classId: number | null, title: string }
 */
router.post('/:id/duplicate', (req, res) => {
  try {
    const original = getActivityIfOwned(Number(req.params.id), req.teacher.id);
    if (!original) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    let classId = original.class_id || null;
    if (req.body?.classId !== undefined) {
      if (req.body.classId === null || req.body.classId === '') {
        classId = null;
      } else {
        const cls = getClassById(Number(req.body.classId), req.teacher.id);
        if (!cls) return res.status(404).json({ error: 'Turma não encontrada.' });
        classId = cls.id;
      }
    }

    let title = `${original.title} (cópia)`.slice(0, 200);
    if (req.body?.title !== undefined) {
      if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.trim().length > 200) {
        return res.status(400).json({ error: 'O título deve ter entre 1 e 200 caracteres.' });
      }
      title = req.body.title.trim();
    }

    const result = createActivity({
      title,
      question: original.question,
      rubric: original.rubric,
      educationLevel: original.education_level,
      subject: original.subject,
      classId,
      dueDate: null,
      rubricCriteria: original.rubric_criteria,
      teacherId: req.teacher.id,
      questionType: original.question_type,
      options: original.options,
      correctOption: original.correct_option,
      questions: parseJsonOrNull(original.questions),
      aiGradeEnabled: Boolean(original.ai_grade_enabled),
    });

    res.status(201).json({ message: 'Cópia criada. Agora é só enviar as respostas.', id: Number(result.id) });
  } catch (error) {
    console.error('Erro ao duplicar atividade:', error);
    res.status(500).json({ error: 'Erro interno ao duplicar a atividade.' });
  }
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH /api/activities/:id
 * Edita os dados gerais: título, disciplina, prazo e turma. Body com qualquer um destes campos:
 * { title, subject, dueDate ('AAAA-MM-DD' ou null), classId (número ou null) }.
 * A turma só muda enquanto a atividade não tem respostas (as respostas ficam ligadas aos
 * alunos da turma original).
 */
router.patch('/:id', (req, res) => {
  try {
    const activity = getActivityIfOwned(Number(req.params.id), req.teacher.id);
    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }
    const body = req.body || {};
    const fields = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) {
        return res.status(400).json({ error: 'O título deve ter entre 1 e 200 caracteres.' });
      }
      fields.title = body.title.trim();
    }
    if (body.subject !== undefined) {
      if (body.subject !== null && (typeof body.subject !== 'string' || body.subject.trim().length > 100)) {
        return res.status(400).json({ error: 'A disciplina deve ter no máximo 100 caracteres.' });
      }
      fields.subject = body.subject && body.subject.trim() ? body.subject.trim() : null;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate !== null && body.dueDate !== '' &&
          (typeof body.dueDate !== 'string' || !DATE_ONLY.test(body.dueDate) || Number.isNaN(Date.parse(body.dueDate)))) {
        return res.status(400).json({ error: 'O prazo deve ser uma data no formato AAAA-MM-DD.' });
      }
      fields.dueDate = body.dueDate || null;
    }
    if (body.classId !== undefined) {
      const newClassId = body.classId === null || body.classId === '' ? null : Number(body.classId);
      if (newClassId !== null) {
        const cls = getClassById(newClassId, req.teacher.id);
        if (!cls) return res.status(404).json({ error: 'Turma não encontrada.' });
      }
      if ((newClassId ?? null) !== (activity.class_id ?? null)) {
        if (getResponsesByActivity(activity.id).length > 0) {
          return res.status(409).json({
            error: 'A turma não pode mudar depois que a atividade recebeu respostas. Use "Reaplicar" para usar a atividade em outra turma.',
          });
        }
        fields.classId = newClassId;
      }
    }

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'Envie ao menos um campo para alterar (title, subject, dueDate ou classId).' });
    }
    updateActivityDetails(activity.id, fields);
    res.json({ message: 'Atividade atualizada.', activity: getActivityIfOwned(activity.id, req.teacher.id) });
  } catch (error) {
    console.error('Erro ao editar atividade:', error);
    res.status(500).json({ error: 'Erro interno ao editar a atividade.' });
  }
});

/**
 * PATCH /api/activities/:id/archive
 * Arquiva ou reativa uma atividade. Arquivar só tira a atividade do painel e da lista
 * principal: respostas, feedbacks e notas continuam guardados. Body: { archived: boolean }
 */
router.patch('/:id/archive', (req, res) => {
  try {
    const activity = getActivityIfOwned(Number(req.params.id), req.teacher.id);
    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }
    if (typeof req.body?.archived !== 'boolean') {
      return res.status(400).json({ error: 'Envie "archived" como true ou false.' });
    }
    setActivityArchived(activity.id, req.body.archived);
    res.json({
      message: req.body.archived ? 'Atividade arquivada.' : 'Atividade reativada.',
      archived: req.body.archived,
    });
  } catch (error) {
    console.error('Erro ao arquivar atividade:', error);
    res.status(500).json({ error: 'Erro interno ao arquivar a atividade.' });
  }
});

/**
 * GET /api/activities/:id/insights
 * Diagnóstico da turma: critérios mais e menos atendidos, distribuição das notas do
 * professor, alunos que pedem atenção e tempo de revisão. Só o professor dono vê.
 */
router.get('/:id/insights', (req, res) => {
  try {
    const activity = getActivityIfOwned(Number(req.params.id), req.teacher.id);
    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }
    res.json(buildActivityInsights(activity, getResponsesByActivity(activity.id)));
  } catch (error) {
    console.error('Erro ao montar o diagnóstico da turma:', error);
    res.status(500).json({ error: 'Erro interno ao montar o diagnóstico.' });
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
