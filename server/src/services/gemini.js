import { GoogleGenAI } from '@google/genai';
import { SYSTEM_INSTRUCTION, buildUserPrompt, FEEDBACK_SCHEMA } from '../prompts/feedback.js';

let genAI = null;

/**
 * Inicializa e retorna o cliente do Gemini com a API key.
 * Usa o pacote @google/genai (substituto do deprecado @google/generative-ai).
 */
function getClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error(
        '❌ GEMINI_API_KEY não configurada. ' +
        'Crie um arquivo .env na raiz do /server com: GEMINI_API_KEY=sua_chave_aqui\n' +
        'Obtenha em: https://aistudio.google.com/'
      );
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

/**
 * Gera feedback pedagógico para um único aluno usando Gemini API.
 *
 * Modelo padrão: gemini-2.5-flash (ativo em set/2026).
 * Para usar um modelo mais recente, defina GEMINI_MODEL=gemini-3.8-flash no .env.
 * Consulte https://ai.google.dev/gemini-api/docs/deprecations para atualizar.
 *
 * @param {Object} params
 * @param {string} params.studentName - Nome do aluno
 * @param {string} params.question - Pergunta da atividade
 * @param {string} params.rubric - Rubrica/gabarito do professor
 * @param {string} params.studentResponse - Resposta do aluno
 * @param {string} params.educationLevel - Nível de ensino
 * @returns {Promise<{raw: string, parsed: object}>}
 */
export async function generateFeedback({ studentName, question, rubric, studentResponse, educationLevel }) {
  const client = getClient();
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  console.log(`🤖 Usando modelo Gemini: ${modelName}`);

  const userPrompt = buildUserPrompt({
    studentName,
    question,
    rubric,
    studentResponse,
    educationLevel,
  });

  try {
    const result = await client.models.generateContent({
      model: modelName,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: FEEDBACK_SCHEMA,
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    const responseText = result.text;
    const parsed = JSON.parse(responseText);

    return {
      raw: responseText,
      parsed,
    };
  } catch (error) {
    console.error(`❌ Erro ao gerar feedback para ${studentName}:`, error.message);

    // Retorna um feedback de erro amigável
    return {
      raw: JSON.stringify({ error: error.message }),
      parsed: {
        pontos_fortes: 'Não foi possível analisar automaticamente.',
        lacunas: 'A IA não conseguiu processar esta resposta.',
        sugestao_melhoria: 'O professor deve revisar manualmente.',
        feedback_completo: `${studentName}, não foi possível gerar o feedback automático para a sua resposta. O professor irá revisar pessoalmente.`,
      },
    };
  }
}

