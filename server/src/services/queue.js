import { generateFeedback } from './gemini.js';
import { saveFeedback, deleteFeedbackByResponseId } from '../database/db.js';

/**
 * Estado global de processamento de atividades.
 * Em produção seria Redis ou similar; no MVP, fica em memória.
 */
const processingState = new Map();

/**
 * Retorna o estado de processamento de uma atividade.
 */
export function getProgress(activityId) {
  return processingState.get(activityId) || {
    status: 'idle',
    total: 0,
    processed: 0,
    errors: 0,
  };
}

/**
 * Processa as respostas dos alunos em lotes, gerando feedbacks via IA.
 * Usa lotes de 3 com delay de 1.5s entre eles para evitar rate limiting.
 *
 * @param {Object} activity - Dados da atividade
 * @param {Array} responses - Lista de respostas dos alunos com seus IDs
 */
export async function processResponses(activity, responses) {
  const activityId = activity.id;
  const BATCH_SIZE = 3;
  const DELAY_MS = 1500;

  processingState.set(activityId, {
    status: 'processing',
    total: responses.length,
    processed: 0,
    errors: 0,
  });

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
          });

          // Salva no banco
          saveFeedback(
            response.id,
            result.raw,
            result.parsed.feedback_completo
          );

          return { success: true, studentName: response.student_name };
        } catch (error) {
          console.error(`❌ Erro no processamento de ${response.student_name}:`, error.message);
          return { success: false, studentName: response.student_name, error: error.message };
        }
      })
    );

    // Atualiza estado
    const state = processingState.get(activityId);
    for (const result of results) {
      state.processed++;
      if (result.status === 'rejected' || (result.value && !result.value.success)) {
        state.errors++;
      }
    }
    processingState.set(activityId, { ...state });

    console.log(`📊 Progresso: ${state.processed}/${state.total} (erros: ${state.errors})`);

    // Delay entre lotes (exceto no último)
    if (i + BATCH_SIZE < responses.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  // Marca como completo
  const finalState = processingState.get(activityId);
  finalState.status = 'complete';
  processingState.set(activityId, finalState);

  console.log(`✅ Processamento da atividade ${activityId} finalizado.`);
}
