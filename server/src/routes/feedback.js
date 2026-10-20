import { Router } from 'express';
import {
  getActivityIfOwned,
  getResponsesByActivity,
  getFeedbackIfOwned,
  updateFeedback,
  approveFeedback,
  deleteFeedbackByResponseId,
  getExportData,
  setFeedbackGrade,
} from '../database/db.js';
import { processResponses, getProgress, markJobError, generateAndSave } from '../services/queue.js';
import { aiGenerateLimiter } from '../middleware/rateLimit.js';
import { reserveQuota, recordUsage, resolveGeminiKey, QuotaError } from '../services/plans.js';
import { countAiNeeded } from '../services/objective.js';

const router = Router();

function sendQuotaError(res, error) {
  return res.status(402).json({ error: error.message, quota: error.status, upgradeUrl: '/planos' });
}

/** Nota do professor: número de 0 a 10 com até uma casa decimal, ou null para apagar. */
function parseGrade(value) {
  if (value === null || value === '') return { grade: null };
  const num = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || num < 0 || num > 10) {
    return { error: 'A nota deve ser um número de 0 a 10.' };
  }
  return { grade: Math.round(num * 10) / 10 };
}

/**
 * POST /api/activities/:id/generate
 * Dispara a geração de feedbacks para todos os alunos da atividade.
 * Retorna imediatamente e processa em background.
 * Previne geração concorrente com 409 Conflict.
 * Endurecimento: aiGenerateLimiter para controle de cota.
 */
router.post('/activities/:id/generate', aiGenerateLimiter, async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    // Verifica posse antes de qualquer operação (prevenção de IDOR)
    const activity = getActivityIfOwned(activityId, req.teacher.id);

    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    // Previne duplo clique / processamento paralelo concorrente
    const currentProgress = getProgress(activityId);
    if (currentProgress && currentProgress.status === 'processing') {
      return res.status(409).json({
        error: 'Já existe um processamento de feedbacks em andamento para esta atividade.',
      });
    }

    const responses = getResponsesByActivity(activityId);

    if (responses.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma resposta de aluno cadastrada para esta atividade.',
      });
    }

    // Filtra apenas respostas sem feedback
    const pendingResponses = responses.filter((r) => !r.feedback_id);

    if (pendingResponses.length === 0) {
      return res.status(200).json({
        message: 'Todos os alunos já possuem feedback gerado.',
        total: responses.length,
      });
    }

    // Cota de IA: questões objetivas só gastam cota nas respostas erradas (explicação do erro)
    const unitsNeeded = activity.question_type === 'objetiva'
      ? countAiNeeded(activity, pendingResponses)
      : pendingResponses.length;
    try {
      reserveQuota(req.teacher.id, 'feedback', unitsNeeded);
    } catch (quotaError) {
      if (quotaError instanceof QuotaError) return sendQuotaError(res, quotaError);
      throw quotaError;
    }
    const apiKey = resolveGeminiKey(req.teacher.id);

    // Inicia processamento em background (a cota já foi reservada; falhas são devolvidas)
    processResponses(activity, pendingResponses, {
      teacherId: req.teacher.id,
      apiKey,
      reservedUnits: unitsNeeded,
    }).catch((error) => {
      console.error('Erro no processamento em background:', error);
      markJobError(activityId);
    });

    res.status(202).json({
      message: `Gerando feedbacks para ${pendingResponses.length} alunos...`,
      total: pendingResponses.length,
    });
  } catch (error) {
    console.error('Erro ao gerar feedbacks:', error);
    res.status(500).json({ error: 'Erro interno ao iniciar geração de feedbacks.' });
  }
});

/**
 * GET /api/activities/:id/progress
 * Retorna o progresso da geração de feedbacks.
 * IDOR fix: verifica posse da atividade antes de expor dados.
 */
router.get('/activities/:id/progress', (req, res) => {
  const activityId = Number(req.params.id);

  // Garante que a atividade pertence ao professor logado
  const activity = getActivityIfOwned(activityId, req.teacher.id);
  if (!activity) {
    return res.status(404).json({ error: 'Atividade não encontrada.' });
  }

  const progress = getProgress(activityId);
  res.json(progress);
});

/**
 * PATCH /api/feedback/:feedbackId
 * Atualiza o feedback com o texto editado pelo professor.
 */
router.patch('/feedback/:feedbackId', (req, res) => {
  try {
    const feedbackId = Number(req.params.feedbackId);
    const { teacherFeedback, teacherRating, criteriaScores, teacherGrade } = req.body;

    if (teacherFeedback === undefined && teacherRating === undefined && criteriaScores === undefined && teacherGrade === undefined) {
      return res.status(400).json({
        error: 'Envie ao menos um campo para atualizar (teacherFeedback, teacherRating, criteriaScores ou teacherGrade).',
      });
    }

    let gradeUpdate = null;
    if (teacherGrade !== undefined) {
      gradeUpdate = parseGrade(teacherGrade);
      if (gradeUpdate.error) {
        return res.status(400).json({ error: gradeUpdate.error });
      }
    }

    if (teacherFeedback !== undefined && (typeof teacherFeedback !== 'string' || teacherFeedback.length > 40000)) {
      return res.status(400).json({
        error: 'O feedback do professor deve ter no máximo 40.000 caracteres.',
      });
    }

    if (teacherRating !== undefined && teacherRating !== null && ![-1, 0, 1].includes(teacherRating)) {
      return res.status(400).json({
        error: 'A avaliação deve ser -1, 0 ou 1.',
      });
    }

    // Verifica posse via JOIN feedbacks → student_responses → activities (prevenção de IDOR)
    const feedback = getFeedbackIfOwned(feedbackId, req.teacher.id);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback não encontrado.' });
    }

    if (gradeUpdate) {
      setFeedbackGrade(feedbackId, gradeUpdate.grade);
    }

    const onlyGrade = teacherFeedback === undefined && teacherRating === undefined && criteriaScores === undefined;
    if (onlyGrade) {
      // Lançar a nota não muda o status: um feedback aprovado continua aprovado
      return res.json({
        message: 'Nota salva.',
        status: feedback.status,
        teacherGrade: gradeUpdate.grade,
      });
    }

    updateFeedback(feedbackId, teacherFeedback, teacherRating, criteriaScores);

    res.json({
      message: 'Feedback atualizado com sucesso!',
      status: 'revisado',
      ...(gradeUpdate ? { teacherGrade: gradeUpdate.grade } : {}),
    });
  } catch (error) {
    console.error('Erro ao atualizar feedback:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar feedback.' });
  }
});

/**
 * POST /api/feedback/:feedbackId/approve
 * Marca o feedback como aprovado pelo professor.
 */
router.post('/feedback/:feedbackId/approve', (req, res) => {
  try {
    const feedbackId = Number(req.params.feedbackId);

    // Verifica posse via JOIN feedbacks → student_responses → activities (prevenção de IDOR)
    const feedback = getFeedbackIfOwned(feedbackId, req.teacher.id);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback não encontrado.' });
    }

    approveFeedback(feedbackId);

    res.json({
      message: 'Feedback aprovado com sucesso!',
      status: 'aprovado',
    });
  } catch (error) {
    console.error('Erro ao aprovar feedback:', error);
    res.status(500).json({ error: 'Erro interno ao aprovar feedback.' });
  }
});

/**
 * POST /api/feedback/:feedbackId/regenerate
 * Regenera o feedback via IA para um aluno específico.
 * Endurecimento: aiGenerateLimiter para controle de cota.
 */
router.post('/feedback/:feedbackId/regenerate', aiGenerateLimiter, async (req, res) => {
  try {
    const feedbackId = Number(req.params.feedbackId);

    // Verifica posse via JOIN feedbacks → student_responses → activities (prevenção de IDOR)
    const feedback = getFeedbackIfOwned(feedbackId, req.teacher.id);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback não encontrado.' });
    }

    // Busca a atividade associada (teacher_id já validado acima)
    const db = (await import('../database/db.js'));
    const response = db.getDb().prepare(`
      SELECT sr.*, a.id AS activity_id, a.question, a.rubric, a.education_level, a.subject, a.rubric_criteria,
             a.question_type, a.options, a.correct_option, a.questions
      FROM student_responses sr
      JOIN activities a ON a.id = sr.activity_id
      WHERE sr.id = ? AND a.teacher_id = ?
    `).get(feedback.student_response_id, req.teacher.id);

    if (!response) {
      return res.status(404).json({ error: 'Resposta do aluno não encontrada.' });
    }

    let parsedCriteria = null;
    if (response.rubric_criteria) {
      try {
        parsedCriteria = typeof response.rubric_criteria === 'string'
          ? JSON.parse(response.rubric_criteria)
          : response.rubric_criteria;
      } catch (err) {
        console.warn('Erro ao parsear rubric_criteria no regenerate:', err);
      }
    }

    const activity = {
      id: response.activity_id,
      question: response.question,
      rubric: response.rubric,
      education_level: response.education_level,
      subject: response.subject,
      question_type: response.question_type,
      options: response.options,
      correct_option: response.correct_option,
      questions: response.questions,
    };

    const units = activity.question_type === 'objetiva' ? countAiNeeded(activity, [response]) : 1;
    try {
      reserveQuota(req.teacher.id, 'feedback', units);
    } catch (quotaError) {
      if (quotaError instanceof QuotaError) return sendQuotaError(res, quotaError);
      throw quotaError;
    }

    // Regenera e só troca o feedback antigo depois que o novo ficou pronto.
    // A nota lançada pelo professor é mantida.
    const previousGrade = feedback.teacher_grade ?? null;
    let result;
    try {
      result = await generateAndSave(activity, response, {
        teacherId: req.teacher.id,
        apiKey: resolveGeminiKey(req.teacher.id),
        parsedCriteria,
        beforeSave: () => deleteFeedbackByResponseId(feedback.student_response_id),
        alreadyReserved: true,
      });
    } catch (genError) {
      recordUsage(req.teacher.id, 'feedback', -units);
      throw genError;
    }
    const newFeedback = result.saved;
    if (previousGrade !== null) setFeedbackGrade(newFeedback.id, previousGrade);

    res.json({
      message: 'Feedback regenerado com sucesso!',
      feedbackId: Number(newFeedback.id),
      feedback: result.parsed,
    });
  } catch (error) {
    console.error('Erro ao regenerar feedback:', error);
    res.status(500).json({ error: 'Erro interno ao regenerar feedback.' });
  }
});

/**
 * GET /api/activities/:id/export
 * Exporta os feedbacks como CSV.
 */
router.get('/activities/:id/export', (req, res) => {
  try {
    const activityId = Number(req.params.id);
    // Verifica posse antes de exportar dados de alunos (prevenção de IDOR)
    const activity = getActivityIfOwned(activityId, req.teacher.id);

    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    const data = getExportData(activityId);

    if (data.length === 0) {
      return res.status(404).json({ error: 'Nenhum dado para exportar.' });
    }

    // Gera CSV com prevenção contra formula injection (DDE / CSV Injection)
    // Células começando com =, +, -, @, \t ou \r são prefixadas com apóstrofo (')
    const escapeCsvCell = (str) => {
      let val = str === null || str === undefined ? '' : String(str);
      if (/^[=+\-@\t\r]/.test(val)) {
        val = `'${val}`;
      }
      return `"${val.replace(/"/g, '""')}"`;
    };

    const header = 'nome_aluno,resposta_original,feedback_final,nota,status';
    const rows = data.map((row) => {
      return [
        escapeCsvCell(row.student_name),
        escapeCsvCell(row.original_response),
        escapeCsvCell(row.feedback_final),
        escapeCsvCell(row.nota === null || row.nota === undefined ? '' : String(row.nota).replace('.', ',')),
        escapeCsvCell(row.status),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    // Nome de arquivo seguro: ASCII para filename="..." e RFC 5987 / RFC 6266 filename*=UTF-8''...
    const rawTitle = (activity.title || 'atividade').trim();
    const asciiTitle = rawTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'atividade';
    const safeAsciiFilename = `feedbacks_${asciiTitle}.csv`;
    const utf8EncodedFilename = encodeURIComponent(`feedbacks_${rawTitle}.csv`)
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${utf8EncodedFilename}`
    );
    res.send('\uFEFF' + csv); // BOM for Excel compatibility
  } catch (error) {
    console.error('Erro ao exportar:', error);
    res.status(500).json({ error: 'Erro interno ao exportar feedbacks.' });
  }
});

export default router;
