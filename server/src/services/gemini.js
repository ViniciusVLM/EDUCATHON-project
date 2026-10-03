import { GoogleGenAI } from '@google/genai';
import { SYSTEM_INSTRUCTION, buildUserPrompt, getFeedbackSchema } from '../prompts/feedback.js';

let genAI = null;
let model = null;

/**
 * Permite injetar um modelo mockado para testes automatizados.
 */
export function setModel(customModel) {
  model = customModel;
}

/**
 * Reseta o modelo e cliente inicializados.
 */
export function resetModel() {
  model = null;
  genAI = null;
}

/**
 * Identifica se um erro é transitório (rede, 429, 5xx ou JSON truncado) e elegível a retry.
 */
export function isTransientError(error) {
  if (!error) return false;
  if (error instanceof SyntaxError) return true;

  const status = error.status || error.statusCode;
  if (status === 429 || (status >= 500 && status < 600)) {
    return true;
  }

  const msg = (error.message || '').toLowerCase();

  // Erros permanentes explícitos não são transitórios
  if (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('permission_denied') ||
    msg.includes('invalid argument') ||
    status === 400 ||
    status === 401 ||
    status === 403
  ) {
    return false;
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
 * Inicializa o cliente do Gemini (SDK @google/genai) com a API key.
 */
function getModel() {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error(
        '❌ GEMINI_API_KEY não configurada. ' +
        'Crie um arquivo .env na raiz do /server com: GEMINI_API_KEY=sua_chave_aqui\n' +
        'Obtenha em: https://aistudio.google.com/'
      );
    }

    genAI = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const client = genAI;
    // Adaptador: mantém a interface `generateContent({ contents, generationConfig })` →
    // `{ response: { text() } }` usada pelos testes e pelo eval, mas usa o SDK atual (@google/genai).
    model = {
      async generateContent({ contents, generationConfig }) {
        const result = await client.models.generateContent({
          model: modelName,
          contents,
          config: { systemInstruction: SYSTEM_INSTRUCTION, ...generationConfig },
        });
        return { response: { text: () => result.text } };
      },
    };
    console.log(`🤖 Usando modelo Gemini: ${modelName}`);
  }
  return model;
}

/**
 * Gera feedback pedagógico para um único aluno usando Gemini API.
 * Aplica retry com backoff exponencial para erros transitórios (429, 5xx, JSON truncado).
 * Lança o erro caso persistente ou esgotadas as tentativas.
 *
 * @param {Object} params
 * @param {string} params.studentName - Nome do aluno
 * @param {string} params.question - Pergunta da atividade
 * @param {string} params.rubric - Rubrica/gabarito do professor
 * @param {string} params.studentResponse - Resposta do aluno
 * @param {string} params.educationLevel - Nível de ensino
 * @param {string} [params.subject] - Disciplina / matéria
 * @param {Array|string} [params.rubricCriteria] - Critérios de avaliação da rubrica
 * @returns {Promise<{raw: string, parsed: Object}>}
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
  const geminiModel = getModel();

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

  const MAX_ATTEMPTS = 3;
  const BASE_DELAY_MS = process.env.NODE_ENV === 'test' ? 30 : 1000;

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
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      return {
        raw: responseText,
        parsed,
      };
    } catch (error) {
      lastError = error;
      const transient = isTransientError(error);

      console.warn(
        `⚠️ Tentativa ${attempt}/${MAX_ATTEMPTS} falhou para ${studentName}: ${error.message} (transitório: ${transient})`
      );

      if (!transient || attempt >= MAX_ATTEMPTS) {
        throw error;
      }

      const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}
