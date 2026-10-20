import { generateFeedback, formatErrorSummary } from './gemini.js';
import { saveFeedback, getDb } from '../database/db.js';
import { generateObjectiveFeedback } from './objective.js';
import { recordUsage } from './plans.js';

// Nos testes automatizados os logs de rotina ficam desligados: muita saída no stdout
// atrapalha a comunicação do executor de testes do Node com cada arquivo.
const log = process.env.NODE_TEST_CONTEXT ? () => {} : console.log;

/**
 * Quando a cota foi reservada antes de começar, devolve as unidades que não viraram feedback.
 * Em questões objetivas, só as respostas que precisam de IA falham, então o número de erros
 * (ou o que sobrou, se o processamento foi abortado) é o que volta para a cota.
 */
function refundFailures(activityId, teacherId, reservedUnits, aborted = false) {
  if (!reservedUnits || !teacherId) return;
  const progress = getProgress(activityId);
  const unused = aborted ? progress.total - progress.processed + progress.errors : progress.errors;
  const refund = Math.min(reservedUnits, Math.max(0, unused));
  if (refund > 0) recordUsage(teacherId, 'feedback', -refund);
}

/**
 * Gera o feedback de UMA resposta, dissertativa ou objetiva, e salva no banco.
 * Registra o uso de IA na cota de quem paga (professor ou instituição) quando a IA foi chamada.
 */
export async function generateAndSave(activity, response, { teacherId = null, apiKey = null, parsedCriteria = null, beforeSave = null, alreadyReserved = false } = {}) {
  if (activity.question_type === 'objetiva') {
    const result = await generateObjectiveFeedback({
      activity,
      studentName: response.student_name,
      studentResponse: response.original_response,
      apiKey,
    });
    if (beforeSave) beforeSave();
    const saved = saveFeedback(
      response.id,
      result.raw,
      result.parsed.feedback_completo,
      result.modelUsed,
      result.parsed.criterios_avaliacao,
      result.autoResult
    );
    if (result.usedAi && teacherId && !alreadyReserved) recordUsage(teacherId, 'feedback', 1);
    return { saved, parsed: result.parsed };
  }

  const result = await generateFeedback({
    studentName: response.student_name,
    question: activity.question,
    rubric: activity.rubric,
    studentResponse: response.original_response,
    educationLevel: activity.education_level,
    subject: activity.subject,
    rubricCriteria: parsedCriteria,
    apiKey,
  });
  if (beforeSave) beforeSave();
  const saved = saveFeedback(
    response.id,
    result.raw,
    result.parsed.feedback_completo,
    result.modelUsed || process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    result.parsed?.criterios_avaliacao || null
  );
  if (teacherId && !alreadyReserved) recordUsage(teacherId, 'feedback', 1);
  return { saved, parsed: result.parsed };
}

// ──────────────────────────────────────────
// Helpers: processing_jobs (SQLite)
// ──────────────────────────────────────────

export function upsertJob(activityId, status, total, processed, errors) {
  const db = getDb();
  db.prepare(`
    INSERT INTO processing_jobs (activity_id, status, total, processed, errors, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(activity_id) DO UPDATE SET
      status     = excluded.status,
      total      = excluded.total,
      processed  = excluded.processed,
      errors     = excluded.errors,
      updated_at = excluded.updated_at
  `).run(activityId, status, total, processed, errors);
}

function incrementJob(activityId, isError) {
  const db = getDb();
  db.prepare(`
    UPDATE processing_jobs
    SET processed  = processed + 1,
        errors     = errors + ?,
        updated_at = datetime('now')
    WHERE activity_id = ?
  `).run(isError ? 1 : 0, activityId);
}

function markJobComplete(activityId) {
  const db = getDb();
  db.prepare(`
    UPDATE processing_jobs
    SET status = 'complete', updated_at = datetime('now')
    WHERE activity_id = ?
  `).run(activityId);
}

/**
 * Marca um job com status 'error' quando abortado ou interrompido.
 */
export function markJobError(activityId) {
  const db = getDb();
  db.prepare(`
    UPDATE processing_jobs
    SET status = 'error', updated_at = datetime('now')
    WHERE activity_id = ?
  `).run(activityId);
}

/**
 * Recupera jobs órfãos que estavam em 'processing' durante reinicialização do servidor,
 * marcando-os como 'error' para impedir polling infinito no frontend.
 */
export function resetOrphanJobs() {
  const db = getDb();
  return db.prepare(`
    UPDATE processing_jobs
    SET status = 'error', updated_at = datetime('now')
    WHERE status = 'processing'
  `).run();
}

// ──────────────────────────────────────────
// API pública
// ──────────────────────────────────────────

/**
 * Retorna o estado de processamento de uma atividade.
 * Persiste no banco — sobrevive a restarts do servidor.
 */
export function getProgress(activityId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM processing_jobs WHERE activity_id = ?').get(activityId);
  return row || {
    status: 'idle',
    total: 0,
    processed: 0,
    errors: 0,
  };
}

/**
 * Processa as respostas dos alunos em lotes, gerando feedbacks via IA.
 * Usa lotes configuráveis via GEMINI_CONCURRENCY (padrão 1) com delay entre eles para evitar rate limiting.
 * O progresso fica registrado no banco e sobrevive a restarts.
 * Não salva feedback falso em caso de erro.
 *
 * @param {Object} activity - Dados da atividade
 * @param {Array}  responses - Lista de respostas dos alunos com seus IDs
 */
export async function processResponses(
  activity,
  responses,
  { teacherId = activity.teacher_id ?? null, apiKey = null, reservedUnits = 0 } = {}
) {
  const activityId = activity.id;
  const rawConcurrency = process.env.GEMINI_CONCURRENCY;
  const parsedConcurrency = rawConcurrency ? parseInt(rawConcurrency, 10) : NaN;
  const BATCH_SIZE = !isNaN(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 1;
  const DELAY_MS = process.env.NODE_ENV === 'test' ? 10 : 1500;

  let parsedCriteria = null;
  if (activity.rubric_criteria) {
    try {
      parsedCriteria = typeof activity.rubric_criteria === 'string'
        ? JSON.parse(activity.rubric_criteria)
        : activity.rubric_criteria;
    } catch (err) {
      console.warn('Erro ao parsear rubric_criteria:', err);
    }
  }

  // Cria / atualiza job como 'processing'
  upsertJob(activityId, 'processing', responses.length, 0, 0);

  try {
    for (let i = 0; i < responses.length; i += BATCH_SIZE) {
      const batch = responses.slice(i, i + BATCH_SIZE);

      // Processa o lote em paralelo
      const results = await Promise.allSettled(
        batch.map(async (response) => {
          try {
            // Salva no banco com registro do modelo utilizado e critérios avaliados
            await generateAndSave(activity, response, {
              teacherId,
              apiKey,
              parsedCriteria,
              alreadyReserved: reservedUnits > 0,
            });

            return { success: true, studentName: response.student_name, responseId: response.id };
          } catch (error) {
            console.error(`❌ Erro no processamento de ${response.student_name}:`, formatErrorSummary(error));
            // NÃO salva feedback falso. A resposta permanece sem feedback_id para reprocessamento.
            return {
              success: false,
              studentName: response.student_name,
              responseId: response.id,
              error: error.message,
            };
          }
        })
      );

      // Atualiza progresso no banco atomicamente
      for (const result of results) {
        const isError = result.status === 'rejected' || (result.value && !result.value.success);
        incrementJob(activityId, isError);
      }

      const progress = getProgress(activityId);
      log(`📊 Progresso: ${progress.processed}/${progress.total} (erros: ${progress.errors})`);

      // Delay entre lotes (exceto no último)
      if (i + BATCH_SIZE < responses.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    // Devolve à cota as gerações reservadas que falharam
    refundFailures(activityId, teacherId, reservedUnits);

    // Marca como completo
    markJobComplete(activityId);
    log(`✅ Processamento da atividade ${activityId} finalizado.`);
  } catch (criticalError) {
    console.error(`❌ Processamento abortado para atividade ${activityId}:`, criticalError);
    refundFailures(activityId, teacherId, reservedUnits, true);
    markJobError(activityId);
    throw criticalError;
  }
}
