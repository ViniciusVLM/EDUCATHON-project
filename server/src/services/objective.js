/**
 * Questões objetivas (múltipla escolha).
 *
 * - A correção é automática, pelo gabarito que o professor cadastrou (sem IA, sem custo).
 * - Quando o aluno erra, a IA escreve uma explicação do erro (conta 1 geração na cota).
 * - O professor continua revisando, editando e aprovando cada feedback, e lança a nota se quiser.
 */
import { generateFeedback, isMockEnabled } from './gemini.js';
import { OBJECTIVE_SYSTEM_INSTRUCTION, OBJECTIVE_SCHEMA, buildObjectivePrompt } from '../prompts/objective.js';

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseOptions(raw) {
  if (!raw) return [];
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(list) ? list.filter((o) => o && o.letra && o.texto) : [];
}

/**
 * Descobre qual alternativa o aluno marcou: "B", "b)", "Letra C", "alternativa d",
 * "(A) texto" ou o próprio texto da alternativa. Devolve a letra maiúscula ou null.
 */
export function parseChosenOption(response, options = []) {
  const text = String(response || '').trim();
  if (!text) return null;
  const letters = options.length ? options.map((o) => o.letra.toUpperCase()) : OPTION_LETTERS;
  const valid = (m) => (m && letters.includes(m[1].toUpperCase()) ? m[1].toUpperCase() : null);

  // 1) O aluno copiou o texto da alternativa
  const normalized = normalize(text);
  const byText = options.find((o) => normalize(o.texto) === normalized);
  if (byText) return byText.letra.toUpperCase();

  // 2) "letra B", "alternativa (c)", "opção d", "resposta: e", "resposta é C"
  const named = valid(text.match(/(?:letra|alternativa|op[çc][ãa]o|resposta(?:\s+[ée])?)\s*[:-]?\s*\(?([a-f])\)?(?![a-zà-ú])/i));
  if (named) return named;

  // 3) Só a letra ("B", "(b)") ou a letra marcando o item ("C) texto", "d. texto", "E - texto")
  return valid(text.match(/^\s*\(?([a-f])\)?\s*$/i)) || valid(text.match(/^\s*\(?([a-f])\s*[).:-]/i));
}

function optionText(options, letter) {
  return options.find((o) => o.letra.toUpperCase() === letter)?.texto || '';
}

function firstName(name) {
  return String(name || 'Aluno').trim().split(/\s+/)[0] || 'Aluno';
}

function buildResult({ parsed, chosen, correct, usedAi, modelUsed }) {
  const acertou = chosen === correct;
  const full = {
    ...parsed,
    criterios_avaliacao: [
      {
        criterio: 'Alternativa correta',
        atendido: acertou,
        evidencia: chosen ? `Marcou ${chosen}; gabarito ${correct}.` : `Resposta não identificada; gabarito ${correct}.`,
      },
    ],
  };
  return {
    raw: JSON.stringify(full),
    parsed: full,
    modelUsed,
    usedAi,
    autoResult: { escolhida: chosen, correta: correct, acertou },
  };
}

/** Quantas respostas vão precisar de explicação da IA (as erradas com alternativa identificada). */
export function countAiNeeded(activity, responses) {
  const options = parseOptions(activity.options);
  const correct = String(activity.correct_option || '').toUpperCase();
  return responses.filter((r) => {
    const chosen = parseChosenOption(r.original_response, options);
    return chosen && chosen !== correct;
  }).length;
}

/**
 * Gera o feedback de uma resposta objetiva.
 * @returns {Promise<{raw, parsed, modelUsed, usedAi, autoResult}>}
 */
export async function generateObjectiveFeedback({ activity, studentName, studentResponse, apiKey = null }) {
  const options = parseOptions(activity.options);
  const correct = String(activity.correct_option || '').toUpperCase();
  const chosen = parseChosenOption(studentResponse, options);
  const name = firstName(studentName);
  const correctText = optionText(options, correct);

  if (chosen === correct) {
    const parsed = {
      pontos_fortes: `Você marcou a alternativa correta (${correct}).`,
      lacunas: '',
      sugestao_melhoria: 'Tente explicar com suas palavras por que as outras alternativas não servem: isso fixa o conteúdo.',
      feedback_completo: `${name}, você acertou: a alternativa ${correct} ("${correctText}") é a resposta da questão. Para fixar o conteúdo, tente explicar com suas palavras por que as outras alternativas não servem.`,
    };
    return buildResult({ parsed, chosen, correct, usedAi: false, modelUsed: 'correcao-automatica' });
  }

  if (!chosen) {
    const parsed = {
      pontos_fortes: 'Você entregou a atividade.',
      lacunas: 'Não foi possível identificar qual alternativa você marcou.',
      sugestao_melhoria: 'Indique a letra da alternativa escolhida (por exemplo, "B").',
      feedback_completo: `${name}, não conseguimos identificar qual alternativa você marcou. A resposta esperada era a alternativa ${correct} ("${correctText}"). Nas próximas atividades, indique claramente a letra escolhida.`,
    };
    return buildResult({ parsed, chosen: null, correct, usedAi: false, modelUsed: 'correcao-automatica' });
  }

  const chosenText = optionText(options, chosen);

  if (isMockEnabled()) {
    const justification = activity.rubric && !/^gabarito:/i.test(activity.rubric.trim())
      ? ` ${activity.rubric.trim()}`
      : '';
    const parsed = {
      pontos_fortes: `A alternativa ${chosen} ("${chosenText}") tem relação com o tema da questão, o que mostra que você reconheceu o assunto.`,
      lacunas: `A alternativa ${chosen} não responde exatamente ao que o enunciado pede.`,
      sugestao_melhoria: 'Releia o enunciado destacando a palavra-chave e compare cada alternativa com ela antes de marcar.',
      feedback_completo: `${name}, a alternativa ${chosen} ("${chosenText}") tem relação com o tema, mas não responde ao que a questão pede. A correta é a ${correct} ("${correctText}").${justification} Na próxima, releia o enunciado destacando a palavra-chave e compare cada alternativa com ela.`,
    };
    return buildResult({ parsed, chosen, correct, usedAi: true, modelUsed: 'mock' });
  }

  const result = await generateFeedback({
    studentName,
    question: activity.question,
    rubric: activity.rubric,
    studentResponse,
    educationLevel: activity.education_level,
    subject: activity.subject,
    apiKey,
    prompt: {
      systemInstruction: OBJECTIVE_SYSTEM_INSTRUCTION,
      responseSchema: OBJECTIVE_SCHEMA,
      userPrompt: buildObjectivePrompt({
        studentName,
        question: activity.question,
        options,
        correctOption: correct,
        chosenOption: chosen,
        rubric: activity.rubric,
        educationLevel: activity.education_level,
        subject: activity.subject,
      }),
    },
  });

  return buildResult({ parsed: result.parsed, chosen, correct, usedAi: true, modelUsed: result.modelUsed });
}
