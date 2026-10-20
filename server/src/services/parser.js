import { parse } from 'csv-parse/sync';
import { composeResponse, splitResponse } from './multiQuestion.js';

/** Coluna de resposta de uma questão específica: resposta_1, resposta 2, questao_3, q4, answer_5 */
const NUMBERED_COLUMN = /^(?:resposta|questao|questão|q|answer)[\s_-]*(\d{1,2})$/i;

/**
 * Faz o parse de um CSV de respostas de alunos.
 * Espera colunas: nome_aluno (ou nome, name, student_name) e resposta (ou response, original_response)
 *
 * @param {string} csvContent - Conteúdo do CSV como string
 * @returns {Array<{student_name: string, original_response: string}>}
 */
export function parseCSV(csvContent, { questionCount = 1 } = {}) {
  // Parse com detecção automática de delimitador
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter: [',', ';', '\t'],
    relax_column_count: true,
  });

  if (records.length === 0) {
    throw new Error('O arquivo CSV está vazio ou não contém dados válidos.');
  }

  // Mapeia nomes de colunas possíveis para os campos internos
  const nameAliases = ['nome_aluno', 'nome', 'name', 'student_name', 'aluno', 'estudante'];
  const responseAliases = ['resposta', 'response', 'original_response', 'texto', 'text', 'answer'];
  const emailAliases = ['email', 'e-mail', 'mail', 'correio_eletronico'];

  const firstRecord = records[0];
  const columns = Object.keys(firstRecord).map(k => k.toLowerCase().trim());

  const nameCol = findColumn(columns, nameAliases, Object.keys(firstRecord));
  const responseCol = findColumn(columns, responseAliases, Object.keys(firstRecord));
  const emailCol = findColumn(columns, emailAliases, Object.keys(firstRecord));

  if (!nameCol) {
    throw new Error(
      `Coluna de nome do aluno não encontrada. Use uma das seguintes: ${nameAliases.join(', ')}. ` +
      `Colunas encontradas: ${Object.keys(firstRecord).join(', ')}`
    );
  }

  // Atividade com várias perguntas: uma coluna por questão (resposta_1, resposta_2...)
  const numberedCols = new Map();
  if (questionCount > 1) {
    for (const original of Object.keys(firstRecord)) {
      const m = original.trim().match(NUMBERED_COLUMN);
      const n = m ? Number(m[1]) : 0;
      if (n >= 1 && n <= questionCount && !numberedCols.has(n)) numberedCols.set(n, original);
    }
  }

  if (questionCount > 1 && numberedCols.size === 0 && !responseCol) {
    throw new Error(
      `Esta atividade tem ${questionCount} perguntas. Use uma coluna por questão: ` +
      `${Array.from({ length: Math.min(questionCount, 3) }, (_, i) => `resposta_${i + 1}`).join(', ')}` +
      `${questionCount > 3 ? ', ...' : ''}. Colunas encontradas: ${Object.keys(firstRecord).join(', ')}`
    );
  }

  if (!responseCol && numberedCols.size === 0) {
    throw new Error(
      `Coluna de resposta não encontrada. Use uma das seguintes: ${responseAliases.join(', ')}. ` +
      `Colunas encontradas: ${Object.keys(firstRecord).join(', ')}`
    );
  }

  const parsed = records
    .map((record, index) => {
      const studentName = record[nameCol]?.trim();
      const email = emailCol ? record[emailCol]?.trim() : null;

      let answers = null;
      let response;
      if (questionCount > 1) {
        if (numberedCols.size > 0) {
          answers = Array.from({ length: questionCount }, (_, i) =>
            numberedCols.has(i + 1) ? String(record[numberedCols.get(i + 1)] ?? '').trim() : ''
          );
        } else {
          // Uma coluna só: tenta separar por "Questão 1: ... Questão 2: ..."
          const text = record[responseCol]?.trim() || '';
          answers = splitResponse(text, questionCount)
            || Array.from({ length: questionCount }, (_, i) => (i === 0 ? text : ''));
        }
        response = answers.some(Boolean) ? composeResponse(answers) : '';
      } else {
        response = record[responseCol]?.trim();
      }

      if (!studentName || !response) {
        console.warn(`⚠️ Linha ${index + 2} ignorada: nome ou resposta vazia.`);
        return null;
      }

      const item = {
        student_name: studentName,
        original_response: response,
      };
      if (email) {
        item.email = email;
      }
      if (answers) {
        item.answers = answers;
      }
      return item;
    })
    .filter(Boolean);

  if (parsed.length === 0) {
    throw new Error('Nenhuma resposta válida encontrada no CSV.');
  }

  return parsed;
}

/**
 * Encontra o nome real da coluna no CSV, comparando com aliases possíveis
 */
function findColumn(lowercaseColumns, aliases, originalColumns) {
  for (let i = 0; i < lowercaseColumns.length; i++) {
    if (aliases.includes(lowercaseColumns[i])) {
      return originalColumns[i];
    }
  }
  return null;
}
