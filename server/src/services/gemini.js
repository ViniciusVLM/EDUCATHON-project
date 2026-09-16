import { GoogleGenerativeAI } from '@google/generative-ai';
import { SYSTEM_INSTRUCTION, buildUserPrompt, FEEDBACK_SCHEMA } from '../prompts/feedback.js';

let genAI = null;
let model = null;

/**
 * Inicializa o cliente do Gemini com a API key.
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

    genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
    });
    console.log(`🤖 Usando modelo Gemini: ${modelName}`);
  }
  return model;
}

/**
 * Gera feedback pedagógico para um único aluno usando Gemini API.
 *
 * @param {Object} params
 * @param {string} params.studentName - Nome do aluno
 * @param {string} params.question - Pergunta da atividade
 * @param {string} params.rubric - Rubrica/gabarito do professor
 * @param {string} params.studentResponse - Resposta do aluno
 * @param {string} params.educationLevel - Nível de ensino
 * @returns {Promise<{pontos_fortes, lacunas, sugestao_melhoria, feedback_completo}>}
 */
export async function generateFeedback({ studentName, question, rubric, studentResponse, educationLevel }) {
  const geminiModel = getModel();

  const userPrompt = buildUserPrompt({
    studentName,
    question,
    rubric,
    studentResponse,
    educationLevel,
  });

  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: FEEDBACK_SCHEMA,
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    const responseText = result.response.text();
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
