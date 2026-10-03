import { generateFeedback } from './gemini.js';
import { saveFeedback, getDb } from '../database/db.js';

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
 * Usa lotes de 3 com delay de 1.5s entre eles para evitar rate limiting.
 * O progresso fica registrado no banco e sobrevive a restarts.
 * Não salva feedback falso em caso de erro.
 *
 * @param {Object} activity - Dados da atividade
 * @param {Array}  responses - Lista de respostas dos alunos com seus IDs
 */
export async function processResponses(activity, responses) {
  const activityId = activity.id;
  const BATCH_SIZE = 3;
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
            const result = await generateFeedback({
              studentName: response.student_name,
              question: activity.question,
              rubric: activity.rubric,
              studentResponse: response.original_response,
              educationLevel: activity.education_level,
              subject: activity.subject,
              rubricCriteria: parsedCriteria,
            });

            const criteriaScores = result.parsed?.criterios_avaliacao || null;

            // Salva no banco com registro do modelo utilizado e critérios avaliados
            saveFeedback(
              response.id,
              result.raw,
              result.parsed.feedback_completo,
              process.env.GEMINI_MODEL || 'gemini-2.5-flash',
              criteriaScores
            );

            return { success: true, studentName: response.student_name, responseId: response.id };
          } catch (error) {
            console.error(`❌ Erro no processamento de ${response.student_name}:`, error.message);
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
      console.log(`📊 Progresso: ${progress.processed}/${progress.total} (erros: ${progress.errors})`);

      // Delay entre lotes (exceto no último)
      if (i + BATCH_SIZE < responses.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    // Marca como completo
    markJobComplete(activityId);
    console.log(`✅ Processamento da atividade ${activityId} finalizado.`);
  } catch (criticalError) {
    console.error(`❌ Processamento abortado para atividade ${activityId}:`, criticalError);
    markJobError(activityId);
    throw criticalError;
  }
}
