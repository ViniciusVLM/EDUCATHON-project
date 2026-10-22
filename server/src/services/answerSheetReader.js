/**
 * Lê provas respondidas (PDF, fotos, Word ou texto) e devolve as respostas de cada aluno
 * para o professor conferir. Nada é salvo aqui: o envio continua pela rota de respostas manuais.
 */
import { getExamModel, hasCustomExamModel } from './examExtractor.js';
import { DocumentError } from './documentReader.js';
import { isMockEnabled, isTransientError, formatErrorSummary } from './gemini.js';
import { getQuestions, splitResponse } from './multiQuestion.js';
import { parseOptions } from './objective.js';
import {
  ANSWER_SHEETS_SYSTEM_INSTRUCTION,
  ANSWER_SHEETS_SCHEMA,
  buildAnswerSheetsPrompt,
} from '../prompts/answerSheets.js';

export const MAX_STUDENTS_PER_FILE = 200;

/** Perguntas da atividade no formato da leitura. */
export function questionsForReading(activity) {
  if (activity.question_type === 'objetiva') {
    return [{ type: 'objetiva', text: activity.question, options: parseOptions(activity.options) }];
  }
  return getQuestions(activity).map((q) => ({ type: 'dissertativa', text: q.pergunta }));
}

function clean(value, max) {
  return String(value ?? '').split(String.fromCharCode(0)).join('').trim().slice(0, max);
}

/** Limpa o que a IA devolveu: nomes, uma resposta por pergunta, limites de tamanho. */
export function normalizeSheets(raw, count) {
  const alunos = Array.isArray(raw?.alunos) ? raw.alunos : [];
  const students = [];
  for (const [i, a] of alunos.entries()) {
    if (students.length >= MAX_STUDENTS_PER_FILE) break;
    const respostas = Array.isArray(a?.respostas) ? a.respostas : [];
    const answers = Array.from({ length: count }, (_, j) => clean(respostas[j], 10000));
    const page = Number.isInteger(a?.pagina_inicial) && a.pagina_inicial > 0 ? a.pagina_inicial : null;
    const name = clean(a?.nome, 100) || `Aluno sem nome (${page ? `página ${page}` : `folha ${i + 1}`})`;
    if (!answers.some(Boolean) && !clean(a?.nome, 100)) continue; // folha vazia
    students.push({ name, page, answers, note: clean(a?.observacao, 300) || null });
  }
  const warnings = (Array.isArray(raw?.avisos) ? raw.avisos : []).map((w) => clean(w, 300)).filter(Boolean).slice(0, 10);
  if (alunos.length > MAX_STUDENTS_PER_FILE) {
    warnings.push(`O arquivo tinha mais de ${MAX_STUDENTS_PER_FILE} alunos; só os primeiros foram lidos.`);
  }
  return { students, warnings };
}

/**
 * Leitor de demonstração (sem IA), só para .txt/.docx: cada aluno começa numa linha "Nome: ..."
 * e as respostas vêm marcadas com "Questão 1:", "Questão 2:"...
 */
export function mockReadSheets(text, count) {
  const blocks = text.split(/^\s*nome\s*:\s*/gim).slice(1);
  const alunos = blocks.map((block) => {
    const [firstLine, ...rest] = block.split('\n');
    const body = rest.join('\n');
    const respostas = count > 1
      ? splitResponse(body, count) || Array.from({ length: count }, (_, i) => (i === 0 ? body.trim() : ''))
      : [body.replace(/^\s*(?:quest[ãa]o|q)\s*1\s*[:.)\-–]\s*/i, '').trim()];
    return { nome: firstLine.trim(), respostas };
  });
  return { alunos, avisos: [] };
}

export async function readAnswerSheets(doc, activity, { apiKey = null } = {}) {
  const questions = questionsForReading(activity);
  const count = questions.length;

  if (!hasCustomExamModel() && isMockEnabled()) {
    if (typeof doc.text !== 'string') {
      throw new DocumentError(
        'No modo de demonstração (sem IA), a leitura de provas respondidas só funciona com Word (.docx) ou texto (.txt). PDF e fotos precisam da chave do Gemini (rode o servidor com npm start).',
        422
      );
    }
    return normalizeSheets(mockReadSheets(doc.text, count), count);
  }

  const model = getExamModel(apiKey);
  const parts = [{ text: buildAnswerSheetsPrompt({ questions }) }];
  if (typeof doc.text === 'string') {
    parts.push({ text: `<provas_respondidas>\n${doc.text}\n</provas_respondidas>` });
  } else {
    parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.buffer.toString('base64') } });
  }
  const config = {
    systemInstruction: ANSWER_SHEETS_SYSTEM_INSTRUCTION,
    responseMimeType: 'application/json',
    responseSchema: ANSWER_SHEETS_SCHEMA,
    temperature: 0.1,
    maxOutputTokens: 32768,
  };

  const MAX_ATTEMPTS = 3;
  const baseDelay = process.env.NODE_ENV === 'test' ? 5 : 2000;
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent({ contents: [{ role: 'user', parts }], config });
      return normalizeSheets(JSON.parse(result.text), count);
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Leitura de provas respondidas — tentativa ${attempt}/${MAX_ATTEMPTS}: ${formatErrorSummary(error)}`);
      if (!(isTransientError(error) || error instanceof SyntaxError) || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** (attempt - 1)));
    }
  }
  const err = new DocumentError(
    'A IA não conseguiu ler as provas respondidas agora. Tente de novo em alguns instantes ou envie as respostas por CSV.',
    502
  );
  err.cause = lastError;
  throw err;
}
