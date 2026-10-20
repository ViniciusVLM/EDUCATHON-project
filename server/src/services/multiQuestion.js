/**
 * Atividades com várias questões dissertativas.
 *
 * Uma atividade pode ter de 1 a MAX_QUESTIONS perguntas, cada uma com a sua rubrica.
 * As colunas antigas (question, rubric) continuam guardando a pergunta 1, então tudo que já
 * existia segue funcionando. A lista completa fica em activities.questions (JSON).
 *
 * A resposta do aluno fica separada por questão em student_responses.answers (JSON) e também
 * montada em texto ("Questão 1: ...") em original_response, para exportação e telas antigas.
 *
 * A IA escreve um rascunho de feedback por questão; o professor revisa e lança UMA nota.
 */

export const MAX_QUESTIONS = 20;
export const MAX_ANSWER_LENGTH = 10000;

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Lista de perguntas da atividade: [{ numero, pergunta, rubrica }]. Sempre ao menos uma. */
export function getQuestions(activity) {
  const stored = parseJson(activity?.questions);
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.map((q, i) => ({
      numero: i + 1,
      pergunta: String(q.pergunta ?? ''),
      rubrica: String(q.rubrica ?? ''),
    }));
  }
  return [{ numero: 1, pergunta: activity?.question ?? '', rubrica: activity?.rubric ?? '' }];
}

export function isMultiQuestion(activity) {
  return activity?.question_type !== 'objetiva' && getQuestions(activity).length > 1;
}

/**
 * Valida as perguntas extras vindas do formulário (a pergunta 1 é validada à parte).
 * Retorna { questions } com a lista completa ou { error }.
 */
export function validateExtraQuestions(rawExtra, first) {
  if (rawExtra === undefined || rawExtra === null) return { questions: null };
  if (!Array.isArray(rawExtra)) return { error: 'extraQuestions deve ser uma lista.' };
  if (rawExtra.length === 0) return { questions: null };
  if (rawExtra.length + 1 > MAX_QUESTIONS) {
    return { error: `O limite é de ${MAX_QUESTIONS} perguntas por atividade.` };
  }
  const questions = [{ pergunta: first.question.trim(), rubrica: first.rubric.trim() }];
  for (let i = 0; i < rawExtra.length; i++) {
    const n = i + 2;
    const pergunta = typeof rawExtra[i]?.question === 'string' ? rawExtra[i].question.trim() : '';
    const rubrica = typeof rawExtra[i]?.rubric === 'string' ? rawExtra[i].rubric.trim() : '';
    if (!pergunta || !rubrica) {
      return { error: `Preencha a pergunta ${n} e a rubrica dela (ou remova a pergunta).` };
    }
    if (pergunta.length > 2000) return { error: `A pergunta ${n} deve ter no máximo 2000 caracteres.` };
    if (rubrica.length > 4000) return { error: `A rubrica da pergunta ${n} deve ter no máximo 4000 caracteres.` };
    questions.push({ pergunta, rubrica });
  }
  return { questions };
}

/** Monta o texto único da resposta: "Questão 1: ...\n\nQuestão 2: ..." */
export function composeResponse(answers) {
  return answers
    .map((a, i) => `Questão ${i + 1}: ${String(a ?? '').trim() || '(sem resposta)'}`)
    .join('\n\n');
}

/**
 * Tenta separar um texto único em N respostas pelos marcadores no começo da linha
 * ("Questão 1:", "Questao 2 -", "Q3)" ...). Retorna null se não achar marcadores.
 */
export function splitResponse(text, count) {
  if (!text || count < 2) return null;
  const marker = /^[ \t]*(?:quest[ãa]o|q)[ \t]*(\d{1,2})[ \t]*[:.)\-–][ \t]*/gim;
  const hits = [];
  let m;
  while ((m = marker.exec(text)) !== null) {
    const num = Number(m[1]);
    if (num >= 1 && num <= count) hits.push({ num, start: m.index, contentStart: m.index + m[0].length });
  }
  // Mantém só a primeira ocorrência de cada número, em ordem crescente
  const ordered = [];
  let last = 0;
  for (const h of hits) {
    if (h.num > last) {
      ordered.push(h);
      last = h.num;
    }
  }
  if (ordered.length < 2) return null;
  const answers = Array.from({ length: count }, () => '');
  ordered.forEach((h, i) => {
    const end = i + 1 < ordered.length ? ordered[i + 1].start : text.length;
    const value = text.slice(h.contentStart, end).trim();
    answers[h.num - 1] = value === '(sem resposta)' ? '' : value;
  });
  return answers;
}

/** Respostas do aluno separadas por questão (sempre `count` itens). */
export function getAnswers(response, count) {
  const stored = parseJson(response?.answers);
  if (Array.isArray(stored)) {
    return Array.from({ length: count }, (_, i) => String(stored[i] ?? ''));
  }
  const split = splitResponse(response?.original_response || '', count);
  if (split) return split;
  // Sem marcação: tudo vai para a questão 1
  return Array.from({ length: count }, (_, i) => (i === 0 ? String(response?.original_response || '') : ''));
}

/**
 * Normaliza respostas por questão enviadas pelo professor.
 * Retorna { answers } ou { error }.
 */
export function normalizeAnswers(raw, count) {
  if (!Array.isArray(raw)) return { error: 'answers deve ser uma lista com uma resposta por questão.' };
  if (raw.length > count) return { error: `Esta atividade tem ${count} perguntas; foram enviadas ${raw.length} respostas.` };
  const answers = Array.from({ length: count }, (_, i) => (typeof raw[i] === 'string' ? raw[i].trim() : ''));
  if (!answers.some(Boolean)) return { error: 'Preencha a resposta de pelo menos uma questão.' };
  const tooLong = answers.findIndex((a) => a.length > MAX_ANSWER_LENGTH);
  if (tooLong >= 0) return { error: `A resposta da questão ${tooLong + 1} deve ter no máximo 10.000 caracteres.` };
  return { answers };
}

/** Feedback de uma questão deixada em branco: não chama a IA. */
export function blankQuestionFeedback() {
  return {
    pontos_fortes: '—',
    lacunas: 'A questão ficou sem resposta.',
    sugestao_melhoria: 'Tente responder, mesmo que parcialmente: mostrar o raciocínio já ajuda.',
    feedback_completo:
      'Você deixou esta questão em branco. Tente responder da próxima vez, mesmo que parcialmente, e tire suas dúvidas com o professor.',
    criterios_avaliacao: [],
    sem_resposta: true,
  };
}

/** Junta os feedbacks das questões num formato que as telas atuais já entendem. */
export function combineFeedbacks(parts) {
  const label = (i) => `Questão ${i + 1}`;
  const join = (field) =>
    parts.map((p, i) => `${label(i)}: ${String(p?.[field] ?? '').trim() || '—'}`).join('\n');

  const criterios = [];
  parts.forEach((p, i) => {
    for (const c of Array.isArray(p?.criterios_avaliacao) ? p.criterios_avaliacao : []) {
      criterios.push({ ...c, criterio: `Q${i + 1} · ${c.criterio}` });
    }
  });

  return {
    pontos_fortes: join('pontos_fortes'),
    lacunas: join('lacunas'),
    sugestao_melhoria: join('sugestao_melhoria'),
    feedback_completo: parts
      .map((p, i) => `${label(i)}\n${String(p?.feedback_completo ?? '').trim()}`)
      .join('\n\n'),
    criterios_avaliacao: criterios,
    questoes: parts.map((p, i) => ({ numero: i + 1, ...p })),
  };
}
