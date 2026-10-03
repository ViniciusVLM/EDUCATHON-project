import { Router } from 'express';
import {
  getActivity,
  getActivityIfOwned,
  getResponsesByActivity,
  getFeedback,
  updateFeedback,
  approveFeedback,
  deleteFeedbackByResponseId,
  saveFeedback,
  getExportData,
} from '../database/db.js';
import { processResponses, getProgress, markJobError } from '../services/queue.js';
import { generateFeedback } from '../services/gemini.js';
import { aiGenerateLimiter } from '../middleware/rateLimit.js';

const router = Router();

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
    const activity = getActivity(activityId);

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

    // Inicia processamento em background
    processResponses(activity, pendingResponses).catch((error) => {
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
    const { teacherFeedback, teacherRating, criteriaScores } = req.body;

    if (teacherFeedback === undefined && teacherRating === undefined && criteriaScores === undefined) {
      return res.status(400).json({
        error: 'Envie ao menos um campo para atualizar (teacherFeedback, teacherRating ou criteriaScores).',
      });
    }

    if (teacherFeedback !== undefined && (typeof teacherFeedback !== 'string' || teacherFeedback.length > 10000)) {
      return res.status(400).json({
        error: 'O feedback do professor deve ter no máximo 10.000 caracteres.',
      });
    }

    if (teacherRating !== undefined && teacherRating !== null && ![-1, 0, 1].includes(teacherRating)) {
      return res.status(400).json({
        error: 'A avaliação deve ser -1, 0 ou 1.',
      });
    }

    const feedback = getFeedback(feedbackId);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback não encontrado.' });
    }

    updateFeedback(feedbackId, teacherFeedback, teacherRating, criteriaScores);

    res.json({
      message: 'Feedback atualizado com sucesso!',
      status: 'revisado',
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

    const feedback = getFeedback(feedbackId);
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

    const feedback = getFeedback(feedbackId);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback não encontrado.' });
    }

    // Busca a atividade associada
    const db = (await import('../database/db.js'));
    const response = db.getDb().prepare(`
      SELECT sr.*, a.question, a.rubric, a.education_level, a.subject, a.rubric_criteria
      FROM student_responses sr
      JOIN activities a ON a.id = sr.activity_id
      WHERE sr.id = ?
    `).get(feedback.student_response_id);

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

    // Regenera
    const result = await generateFeedback({
      studentName: response.student_name,
      question: response.question,
      rubric: response.rubric,
      studentResponse: response.original_response,
      educationLevel: response.education_level,
      subject: response.subject,
      rubricCriteria: parsedCriteria,
    });

    const criteriaScores = result.parsed?.criterios_avaliacao || null;

    // Remove feedback antigo e salva novo
    deleteFeedbackByResponseId(feedback.student_response_id);
    const newFeedback = saveFeedback(
      feedback.student_response_id,
      result.raw,
      result.parsed.feedback_completo,
      process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      criteriaScores
    );

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
    const activity = getActivity(activityId);

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

    const header = 'nome_aluno,resposta_original,feedback_final,status';
    const rows = data.map((row) => {
      return [
        escapeCsvCell(row.student_name),
        escapeCsvCell(row.original_response),
        escapeCsvCell(row.feedback_final),
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
