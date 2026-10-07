import { GoogleGenAI } from '@google/genai';
import { SYSTEM_INSTRUCTION, buildUserPrompt, getFeedbackSchema } from '../prompts/feedback.js';

let genAI = null;
let customModel = null;
let customFallbackModel = null;
const modelCache = new Map();

/**
 * Permite injetar um modelo mockado (e opcionalmente modelo reserva) para testes automatizados.
 */
export function setModel(mockModel, mockFallbackModel = null) {
  customModel = mockModel;
  if (mockFallbackModel) {
    customFallbackModel = mockFallbackModel;
  }
}

/**
 * Permite injetar um modelo reserva mockado para testes automatizados.
 */
export function setFallbackModel(mockFallbackModel) {
  customFallbackModel = mockFallbackModel;
}

/**
 * Reseta os modelos e cliente inicializados.
 */
export function resetModel() {
  customModel = null;
  customFallbackModel = null;
  genAI = null;
  modelCache.clear();
}

/**
 * Formata o erro em uma linha curta e legível (status + mensagem, sem o JSON bruto do SDK).
 */
export function formatErrorSummary(error) {
  if (!error) return 'Erro desconhecido';

  const status = error.status || error.statusCode || (error.message && error.message.match(/\b([45]\d\d)\b/)?.[1]);

  let msg = error.message || String(error);

  // Se a mensagem contiver JSON embutido (comum no SDK do Gemini/Google), extrai a mensagem interna limpa
  const jsonMatch = msg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const innerMsg = parsed?.error?.message || parsed?.message;
      const prefix = msg.slice(0, jsonMatch.index).replace(/[:.\s]+$/, '').trim();
      if (innerMsg) {
        msg = prefix ? `${prefix}: ${innerMsg}` : innerMsg;
      } else if (prefix) {
        msg = prefix;
      }
    } catch {
      msg = msg.slice(0, 150);
    }
  }

  msg = msg.replace(/\s+/g, ' ').trim();

  if (status && !msg.includes(String(status))) {
    return `[${status}] ${msg}`;
  }

  return msg;
}

/**
 * Extrai o tempo de espera (em milissegundos) quando a resposta/erro contiver retryDelay ou Retry-After.
 */
export function parseRetryDelay(error) {
  if (!error) return null;

  let raw = error.retryDelay;

  if (raw === undefined && error.details) {
    const list = Array.isArray(error.details) ? error.details : [error.details];
    for (const item of list) {
      if (item && item.retryDelay !== undefined) {
        raw = item.retryDelay;
        break;
      }
    }
  }

  if (raw === undefined && error.errorDetails) {
    const list = Array.isArray(error.errorDetails) ? error.errorDetails : [error.errorDetails];
    for (const item of list) {
      if (item && item.retryDelay !== undefined) {
        raw = item.retryDelay;
        break;
      }
    }
  }

  if (raw === undefined && error.error?.details) {
    const list = Array.isArray(error.error.details) ? error.error.details : [error.error.details];
    for (const item of list) {
      if (item && item.retryDelay !== undefined) {
        raw = item.retryDelay;
        break;
      }
    }
  }

  if (raw === undefined) {
    const retryAfter = error.response?.headers?.get?.('retry-after') ||
      error.headers?.['retry-after'] ||
      error.headers?.get?.('retry-after') ||
      error.retryAfter;
    if (retryAfter !== undefined) {
      raw = retryAfter;
    }
  }

  if (raw === undefined || raw === null) return null;

  if (typeof raw === 'number') {
    return raw > 0 ? raw : null;
  }

  if (typeof raw === 'object') {
    const seconds = Number(raw.seconds) || 0;
    const nanos = Number(raw.nanos) || 0;
    const ms = seconds * 1000 + Math.round(nanos / 1e6);
    return ms > 0 ? ms : null;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const msMatch = trimmed.match(/^([\d.]+)\s*ms$/i);
    if (msMatch) {
      return parseFloat(msMatch[1]);
    }
    const sMatch = trimmed.match(/^([\d.]+)\s*s$/i);
    if (sMatch) {
      return parseFloat(sMatch[1]) * 1000;
    }
    const num = parseFloat(trimmed);
    if (!isNaN(num) && num > 0) {
      return num;
    }
  }

  return null;
}

/**
 * Identifica se um erro é transitório (rede, 429, 5xx ou JSON truncado) e elegível a retry.
 */
export function isTransientError(error) {
  if (!error) return false;
  if (error instanceof SyntaxError) return true;

  const status = error.status || error.statusCode;
  const msg = (error.message || '').toLowerCase();

  // Erros permanentes explícitos não são transitórios e não devem sofrer retry
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('permission_denied') ||
    msg.includes('invalid argument') ||
    msg.includes('unauthenticated') ||
    msg.includes('401 unauthorized') ||
    msg.includes('403 forbidden') ||
    msg.includes('400 bad request')
  ) {
    return false;
  }

  if (status === 429 || (status >= 500 && status < 600)) {
    return true;
  }

  // Padrões transitórios conhecidos
  if (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('service unavailable') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('internal error') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network error')
  ) {
    return true;
  }

  return false;
}

/**
 * Identifica se o erro é decorrente de sobrecarga/limite (503 ou 429),
 * qualificando para acionamento do modelo reserva.
 */
export function is503Or429(error) {
  if (!error) return false;
  const status = error.status || error.statusCode;
  if (status === 503 || status === 429) {
    return true;
  }
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('service unavailable')
  );
}

/**
 * Verifica se a chave do Gemini é considerada placeholder, inválida ou ausente.
 * Chaves válidas começam com "AIza" ou "AQ." (novo formato do Google AI Studio) e não contêm "your_".
 *
 * @param {string} [apiKey=process.env.GEMINI_API_KEY]
 * @returns {boolean} true se for placeholder ou ausente
 */
export function isGeminiApiKeyPlaceholder(apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    return true;
  }
  const trimmed = apiKey.trim();
  if (trimmed.includes('your_')) {
    return true;
  }
  return !trimmed.startsWith('AIza') && !trimmed.startsWith('AQ.');
}

/**
 * Valida a chave da API do Gemini na inicialização.
 * Se estiver ausente ou for placeholder e o modo mock não estiver ativo,
 * emite um aviso claro no log sem derrubar o servidor.
 */
export function checkGeminiApiKeyOnStartup() {
  const isMockMode =
    process.env.GEMINI_MOCK === 'true' ||
    process.argv.includes('--mock');

  if (isMockMode) {
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (isGeminiApiKeyPlaceholder(apiKey)) {
    console.warn(
      '⚠️ AVISO: GEMINI_API_KEY ausente ou configurada com valor placeholder no .env.\n' +
      '  A geração real de feedbacks via Gemini estará indisponível até que uma chave válida\n' +
      '  (iniciando com "AIza" ou "AQ.") seja adicionada. Obtenha sua chave em: https://aistudio.google.com/'
    );
  }
}

/**
 * Obtém ou cria a instância de modelo do Gemini para um dado nome de modelo.
 */
export function getModel(modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash') {
  if (customModel) {
    return customModel;
  }

  if (!modelCache.has(modelName)) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (isGeminiApiKeyPlaceholder(apiKey)) {
      throw new Error(
        '❌ GEMINI_API_KEY não configurada ou inválida. ' +
        'Crie um arquivo .env na raiz do /server com uma chave válida iniciando com "AIza" ou "AQ.".\n' +
        'Obtenha em: https://aistudio.google.com/'
      );
    }

    if (!genAI) {
      genAI = new GoogleGenAI({ apiKey });
    }

    const client = genAI;
    modelCache.set(modelName, {
      async generateContent({ contents, generationConfig }) {
        const result = await client.models.generateContent({
          model: modelName,
          contents,
          config: { systemInstruction: SYSTEM_INSTRUCTION, ...generationConfig },
        });
        return { response: { text: () => result.text } };
      },
    });
    console.log(`🤖 Inicializado modelo Gemini: ${modelName}`);
  }

  return modelCache.get(modelName);
}

/**
 * Gera feedback pedagógico para um único aluno usando Gemini API.
 * Aplica 4 tentativas com backoff exponencial e jitter para erros transitórios.
 * Se esgotar tentativas com 503 ou 429, aciona o modelo reserva configurado (GEMINI_FALLBACK_MODEL).
 *
 * @param {Object} params
 * @param {string} params.studentName - Nome do aluno
 * @param {string} params.question - Pergunta da atividade
 * @param {string} params.rubric - Rubrica/gabarito do professor
 * @param {string} params.studentResponse - Resposta do aluno
 * @param {string} params.educationLevel - Nível de ensino
 * @param {string} [params.subject] - Disciplina / matéria
 * @param {Array|string} [params.rubricCriteria] - Critérios de avaliação da rubrica
 * @returns {Promise<{raw: string, parsed: Object, modelUsed: string}>}
 */
export async function generateFeedback({
  studentName,
  question,
  rubric,
  studentResponse,
  educationLevel,
  subject,
  rubricCriteria,
}) {
  const mainModelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbackModelName = process.env.GEMINI_FALLBACK_MODEL;

  const geminiModel = customModel || getModel(mainModelName);

  const userPrompt = buildUserPrompt({
    studentName,
    question,
    rubric,
    studentResponse,
    educationLevel,
    subject,
    rubricCriteria,
  });

  const responseSchema = getFeedbackSchema(rubricCriteria);

  const MAX_ATTEMPTS = 4;
  const isTest = process.env.NODE_ENV === 'test';
  const BASE_DELAY_MS = isTest ? 10 : 2000;

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
        model: mainModelName,
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      return {
        raw: responseText,
        parsed,
        modelUsed: mainModelName,
      };
    } catch (error) {
      lastError = error;
      const transient = isTransientError(error);

      console.warn(
        `⚠️ Tentativa ${attempt}/${MAX_ATTEMPTS} falhou para ${studentName}: ${formatErrorSummary(error)} (transitório: ${transient})`
      );

      // Erro permanente aborta sem retries
      if (!transient) {
        throw error;
      }

      // Esgotou as 4 tentativas do modelo principal
      if (attempt >= MAX_ATTEMPTS) {
        break;
      }

      // Tempo de espera: respeita retryDelay do 429 se fornecido, senão usa backoff exponencial com jitter
      const retryDelay = parseRetryDelay(error);
      let waitMs;
      if (retryDelay !== null && retryDelay > 0) {
        waitMs = retryDelay;
      } else {
        const exponentialMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitterMs = isTest ? Math.random() * 5 : Math.random() * 1000;
        waitMs = Math.round(exponentialMs + jitterMs);
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  // Se esgotou as tentativas do modelo principal com 503 ou 429 e houver modelo reserva configurado:
  const hasFallback = Boolean(fallbackModelName || customFallbackModel);
  if (hasFallback && is503Or429(lastError)) {
    const effectiveFallbackName = fallbackModelName || 'gemini-fallback';
    console.warn(
      `🔄 Modelo principal (${mainModelName}) esgotou tentativas com sobrecarga (${formatErrorSummary(lastError)}). Tentando modelo reserva (${effectiveFallbackName})...`
    );

    const fallbackModel = customFallbackModel || (customModel || getModel(effectiveFallbackName));

    try {
      const result = await fallbackModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
        model: effectiveFallbackName,
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      return {
        raw: responseText,
        parsed,
        modelUsed: fallbackModelName || effectiveFallbackName,
      };
    } catch (fallbackError) {
      console.error(
        `❌ Tentativa com modelo reserva (${effectiveFallbackName}) falhou para ${studentName}: ${formatErrorSummary(fallbackError)}`
      );
      throw fallbackError;
    }
  }

  throw lastError;
}
