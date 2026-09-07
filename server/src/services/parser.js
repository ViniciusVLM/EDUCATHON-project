import { parse } from 'csv-parse/sync';

/**
 * Faz o parse de um CSV de respostas de alunos.
 * Espera colunas: nome_aluno (ou nome, name, student_name) e resposta (ou response, original_response)
 *
 * @param {string} csvContent - Conteúdo do CSV como string
 * @returns {Array<{student_name: string, original_response: string}>}
 */
export function parseCSV(csvContent) {
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

  const firstRecord = records[0];
  const columns = Object.keys(firstRecord).map(k => k.toLowerCase().trim());

  const nameCol = findColumn(columns, nameAliases, Object.keys(firstRecord));
  const responseCol = findColumn(columns, responseAliases, Object.keys(firstRecord));

  if (!nameCol) {
    throw new Error(
      `Coluna de nome do aluno não encontrada. Use uma das seguintes: ${nameAliases.join(', ')}. ` +
      `Colunas encontradas: ${Object.keys(firstRecord).join(', ')}`
    );
  }

  if (!responseCol) {
    throw new Error(
      `Coluna de resposta não encontrada. Use uma das seguintes: ${responseAliases.join(', ')}. ` +
      `Colunas encontradas: ${Object.keys(firstRecord).join(', ')}`
    );
  }

  const parsed = records
    .map((record, index) => {
      const studentName = record[nameCol]?.trim();
      const response = record[responseCol]?.trim();

      if (!studentName || !response) {
        console.warn(`⚠️ Linha ${index + 2} ignorada: nome ou resposta vazia.`);
        return null;
      }

      return {
        student_name: studentName,
        original_response: response,
      };
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
