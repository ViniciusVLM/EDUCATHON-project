/**
 * Lê a prova com o Gemini (ou com o leitor de demonstração) e devolve rascunhos de atividades,
 * já limpos e dentro dos limites do formulário. Nada é salvo: o professor revisa e cria.
 */
import { GoogleGenAI } from '@google/genai';
import {
  EXAM_IMPORT_SYSTEM_INSTRUCTION,
  EXAM_IMPORT_SCHEMA,
  buildExamImportPrompt,
} from '../prompts/examImport.js';
import {
  isGeminiApiKeyPlaceholder,
  isMockEnabled,
  isTransientError,
  formatErrorSummary,
  getClientForKey,
} from './gemini.js';
import { DocumentError } from './documentReader.js';

export const LIMITS = {
  title: 200,
  question: 2000,
  rubric: 4000,
  subject: 100,
  criterion: 200,
  criteriaPerQuestion: 20,
  questions: 30,
  option: 500,
  options: 6,
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function cleanOptions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((o) => cleanString(typeof o === 'string' ? o : o?.texto, LIMITS.option))
    .filter(Boolean)
    .slice(0, LIMITS.options)
    .map((texto, i) => ({ letra: OPTION_LETTERS[i], texto }));
}

const VALID_LEVELS = ['fundamental', 'medio', 'superior'];

let customExamModel = null;
let genAI = null;

/** Permite injetar um modelo falso nos testes: { generateContent({contents, config}) => {text} } */
export function setExamModel(model) {
  customExamModel = model;
}

export function resetExamModel() {
  customExamModel = null;
  genAI = null;
}

// ──────────────────────────────────────────
// Limpeza da resposta da IA
// ──────────────────────────────────────────

function cleanString(value, max) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  return str.length > max ? str.slice(0, max).trim() : str;
}

function cleanDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return value.trim();
}

function cleanCriteria(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const criterio = cleanString(item?.criterio, LIMITS.criterion);
    if (!criterio) continue;
    const key = criterio.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let peso = Math.round(Number(item?.peso));
    if (!Number.isFinite(peso) || peso < 1) peso = 1;
    if (peso > 5) peso = 5;
    result.push({ criterio, peso });
    if (result.length >= LIMITS.criteriaPerQuestion) break;
  }
  return result;
}

/**
 * Normaliza um texto de turma para comparação: "8º Ano - B" → "8 ano b", "Turma 8B" → "8 b".
 */
export function normalizeClassName(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ºª°]/g, ' ')
    .replace(/\bturma\b/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CLASS_FILLER = new Set(['ano', 'serie', 'do', 'da', 'de', 'em', 'ensino', 'fundamental', 'medio']);

function classTokens(text) {
  return normalizeClassName(text)
    .split(' ')
    .filter((t) => t && !CLASS_FILLER.has(t));
}

/**
 * Procura, entre as turmas do professor, a que corresponde ao texto lido na prova.
 * Só sugere quando há uma única turma compatível — na dúvida, deixa o professor escolher.
 */
export function matchClass(detectedText, classes = []) {
  if (!detectedText || !Array.isArray(classes) || classes.length === 0) return null;

  const normalized = normalizeClassName(detectedText);
  if (!normalized) return null;

  const exact = classes.filter((c) => normalizeClassName(c.name) === normalized);
  if (exact.length === 1) return exact[0].id;

  const detected = classTokens(detectedText);
  if (detected.length === 0) return null;

  const candidates = classes.filter((c) => {
    const tokens = classTokens(c.name);
    if (tokens.length === 0) return false;
    const [small, big] = detected.length <= tokens.length ? [detected, tokens] : [tokens, detected];
    return small.every((t) => big.includes(t));
  });

  return candidates.length === 1 ? candidates[0].id : null;
}

/**
 * Converte a saída da IA (ou do leitor de demonstração) no formato da API, aplicando limites.
 */
export function normalizeExtraction(raw, classes = []) {
  const data = raw && typeof raw === 'object' ? raw : {};

  const educationLevel = VALID_LEVELS.includes(data.nivel_ensino) ? data.nivel_ensino : null;
  const subject = cleanString(data.disciplina, LIMITS.subject) || null;
  const examTitle = cleanString(data.titulo_prova, LIMITS.title) || null;
  const classText = cleanString(data.turma, 60) || null;

  const rawQuestions = Array.isArray(data.questoes) ? data.questoes : [];
  const questions = [];
  let unusableObjective = 0;
  for (const q of rawQuestions) {
    const question = cleanString(q?.enunciado, LIMITS.question);
    if (question.length < 5) continue;

    const number = cleanString(q?.numero, 10);
    const shortTitle = cleanString(q?.titulo, 120);
    let title = shortTitle || (number ? `Questão ${number}` : `Questão ${questions.length + 1}`);
    if (examTitle && number) {
      title = `${examTitle} — Questão ${number}${shortTitle ? `: ${shortTitle}` : ''}`;
    }

    if (q?.tipo === 'objetiva') {
      const options = cleanOptions(q?.alternativas);
      if (options.length < 2) {
        unusableObjective++;
        continue;
      }
      const letter = cleanString(q?.alternativa_correta, 2).toUpperCase().replace(/[^A-F]/g, '');
      const correctOption = options.some((o) => o.letra === letter) ? letter : null;
      questions.push({
        number: number || String(questions.length + 1),
        title: cleanString(title, LIMITS.title),
        type: 'objetiva',
        question,
        options,
        correctOption,
        rubric: cleanString(q?.rubrica, LIMITS.rubric),
        rubricFromDocument: Boolean(correctOption),
        criteria: [],
      });
    } else {
      questions.push({
        number: number || String(questions.length + 1),
        title: cleanString(title, LIMITS.title),
        type: 'dissertativa',
        question,
        options: [],
        correctOption: null,
        rubric: cleanString(q?.rubrica, LIMITS.rubric),
        rubricFromDocument: q?.gabarito_no_documento === true,
        criteria: cleanCriteria(q?.criterios),
      });
    }
    if (questions.length >= LIMITS.questions) break;
  }

  const ignored = Math.max(0, Math.round(Number(data.questoes_objetivas_ignoradas) || 0)) + unusableObjective;

  return {
    exam: {
      title: examTitle,
      subject,
      educationLevel,
      dueDate: cleanDate(data.data_entrega),
      classText,
    },
    suggestedClassId: matchClass(classText, classes),
    questions,
    ignoredObjectiveQuestions: ignored,
  };
}

// ──────────────────────────────────────────
// Leitor de demonstração (GEMINI_MOCK=true)
// ──────────────────────────────────────────

const QUESTION_START = /^\s*(?:quest[aã]o\s*(\d{1,2}[a-z]?)\s*[:.)\-–—]?|(\d{1,2})\s*[).\-–—]\s+)/i;
const ANSWER_KEY = /^\s*(?:gabarito|resposta\s+esperada|crit[ée]rios?\s+de\s+corre[çc][ãa]o|espera-se\s+que)\s*[:\-–—]?\s*/i;
const OPTION_LINE = /^\s*\(?([a-f])\s*[).]\s+(\S.*)$/i;
const OBJECTIVE_KEY = /^\s*(?:gabarito|resposta(?:\s+correta)?|alternativa\s+correta)\s*[:\-–—]\s*\(?([a-f])\)?\s*(?:[).,;:\-–—]\s*(.*))?$/i;

function detectLevel(text) {
  const t = text.toLowerCase();
  if (/(faculdade|universidade|gradua[çc][ãa]o|ensino superior)/.test(t)) return 'superior';
  if (/(\b[1-3]\s*[ªa°]?\s*s[ée]rie|ensino m[ée]dio)/.test(t)) return 'medio';
  if (/(\b[1-9]\s*[ºo°]?\s*ano\b|ensino fundamental)/.test(t)) return 'fundamental';
  return 'desconhecido';
}

function toIsoDate(text) {
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/**
 * Versão simples, sem IA, para demonstração: reconhece cabeçalhos ("Turma:", "Disciplina:"),
 * questões numeradas e gabaritos escritos como "Gabarito:" ou "Resposta esperada:".
 */
export function mockExtractExam(text) {
  const lines = text.split('\n');
  const head = lines.slice(0, 15).join('\n');

  const turma = head.match(/turma\s*[:\-–]?\s*([^\n|;]{1,40})/i)?.[1]
    || head.match(/\b(\d{1,2}\s*[ºª°]?\s*(?:ano|s[ée]rie)\s*[A-Z]?)\b/i)?.[1]
    || null;
  const disciplina = head.match(/(?:disciplina|mat[ée]ria|componente curricular)\s*[:\-–]\s*([^\n|;]{1,60})/i)?.[1] || null;
  const titleLine = lines.find((l) => /\b(prova|avalia[çc][ãa]o|atividade|exerc[íi]cios|lista)\b/i.test(l));

  const blocks = [];
  let current = null;
  for (const line of lines) {
    const start = line.match(QUESTION_START);
    if (start) {
      current = { numero: start[1] || start[2], lines: [line.slice(start[0].length)] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  const ignored = 0;
  const questoes = [];
  for (const block of blocks) {
    const optionLines = block.lines.filter((l) => OPTION_LINE.test(l));
    if (optionLines.length >= 3) {
      const enunciadoLines = [];
      let correta = null;
      let justificativa = '';
      for (const line of block.lines) {
        if (OPTION_LINE.test(line)) continue;
        const key = line.match(OBJECTIVE_KEY);
        if (key) {
          correta = key[1].toUpperCase();
          justificativa = (key[2] || '').trim();
          continue;
        }
        if (/_{3,}/.test(line) || /^\s*(nome|data|n[ºo°]|assinatura)\s*:/i.test(line)) continue;
        enunciadoLines.push(line);
      }
      const enunciado = enunciadoLines.join('\n').trim();
      questoes.push({
        numero: block.numero,
        tipo: 'objetiva',
        titulo: enunciado.replace(/\s+/g, ' ').split(' ').slice(0, 8).join(' ').replace(/[.,;:?!]+$/, ''),
        enunciado,
        alternativas: optionLines.map((l) => {
          const m = l.match(OPTION_LINE);
          return { letra: m[1].toUpperCase(), texto: m[2].trim() };
        }),
        alternativa_correta: correta,
        gabarito_no_documento: Boolean(correta),
        rubrica: justificativa,
        criterios: [],
      });
      continue;
    }
    const answerIdx = block.lines.findIndex((l) => ANSWER_KEY.test(l));
    const statementLines = (answerIdx === -1 ? block.lines : block.lines.slice(0, answerIdx))
      // Linhas de preenchimento do cabeçalho/rodapé ("Nome: ______") não fazem parte do enunciado
      .filter((l) => !/_{3,}/.test(l) && !/^\s*(nome|data|n[ºo°]|assinatura)\s*:/i.test(l));
    const answerLines = answerIdx === -1 ? [] : [block.lines[answerIdx].replace(ANSWER_KEY, ''), ...block.lines.slice(answerIdx + 1)];
    const enunciado = statementLines.join('\n').trim();
    const rubrica = answerLines.join('\n').trim();

    const firstWords = enunciado.replace(/\s+/g, ' ').split(' ').slice(0, 8).join(' ');
    questoes.push({
      numero: block.numero,
      tipo: 'dissertativa',
      titulo: firstWords.replace(/[.,;:?!]+$/, ''),
      enunciado,
      gabarito_no_documento: Boolean(rubrica),
      rubrica,
      criterios: rubrica
        ? rubrica
            .split(/[\n;]|,\s+(?=[a-zà-ú])/i)
            .map((part) => part.replace(/^[\s\-•*\d.)]+/, '').trim())
            .filter((part) => part.length >= 4)
            .slice(0, 4)
            .map((part) => ({ criterio: part.charAt(0).toUpperCase() + part.slice(1), peso: 1 }))
        : [],
    });
  }

  return {
    titulo_prova: titleLine ? titleLine.trim() : null,
    disciplina: disciplina ? disciplina.trim() : null,
    nivel_ensino: detectLevel(head),
    turma: turma ? turma.trim() : null,
    data_entrega: toIsoDate(head),
    questoes_objetivas_ignoradas: ignored,
    questoes,
  };
}

// ──────────────────────────────────────────
// Chamada ao Gemini
// ──────────────────────────────────────────

function getExamModel(ownKey = null) {
  if (customExamModel) return customExamModel;

  let client;
  if (ownKey) {
    client = getClientForKey(ownKey).client;
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (isGeminiApiKeyPlaceholder(apiKey)) {
      throw new DocumentError(
        'A leitura de provas precisa da chave do Gemini configurada no servidor (GEMINI_API_KEY).',
        503
      );
    }
    if (!genAI) genAI = new GoogleGenAI({ apiKey });
    client = genAI;
  }
  const model = process.env.GEMINI_IMPORT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  return {
    async generateContent({ contents, config }) {
      const result = await client.models.generateContent({ model, contents, config });
      return { text: result.text };
    },
  };
}

/**
 * @param {{kind: string, mimeType: string, text?: string, buffer?: Buffer, truncated?: boolean}} doc
 * @param {{fileName?: string, classes?: Array}} options
 */
export async function extractExam(doc, { fileName, classes = [], apiKey = null } = {}) {
  if (!customExamModel && isMockEnabled()) {
    if (typeof doc.text !== 'string') {
      throw new DocumentError(
        'No modo de demonstração (sem IA), só dá para ler provas em Word (.docx) ou texto (.txt). PDF e fotos precisam da chave do Gemini.',
        422
      );
    }
    return normalizeExtraction(mockExtractExam(doc.text), classes);
  }

  const model = getExamModel(apiKey);
  const prompt = buildExamImportPrompt({ text: doc.text, fileName, truncated: doc.truncated });
  const parts = [{ text: prompt }];
  if (typeof doc.text !== 'string') {
    parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.buffer.toString('base64') } });
  }

  const config = {
    systemInstruction: EXAM_IMPORT_SYSTEM_INSTRUCTION,
    responseMimeType: 'application/json',
    responseSchema: EXAM_IMPORT_SCHEMA,
    temperature: 0.2,
    maxOutputTokens: 8192,
  };

  const MAX_ATTEMPTS = 3;
  const baseDelay = process.env.NODE_ENV === 'test' ? 5 : 2000;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent({ contents: [{ role: 'user', parts }], config });
      const parsed = JSON.parse(result.text);
      return normalizeExtraction(parsed, classes);
    } catch (error) {
      lastError = error;
      const transient = isTransientError(error);
      console.warn(`⚠️ Leitura da prova — tentativa ${attempt}/${MAX_ATTEMPTS}: ${formatErrorSummary(error)}`);
      if (!transient || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** (attempt - 1)));
    }
  }

  const err = new DocumentError(
    'A IA não conseguiu ler a prova agora. Tente de novo em alguns instantes ou preencha o formulário manualmente.',
    502
  );
  err.cause = lastError;
  throw err;
}
