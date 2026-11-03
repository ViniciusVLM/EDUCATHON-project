/**
 * Diagnóstico da turma: transforma as respostas e os feedbacks de uma atividade
 * em indicadores que ajudam o professor a decidir o que retomar em aula.
 *
 * Função pura (sem banco), para ser fácil de testar. Recebe as linhas de
 * getResponsesByActivity e a atividade.
 *
 * Regras de produto:
 * - A nota oficial é só a do professor (teacher_grade). A nota sugerida pela IA (ai_grade)
 *   aparece apenas como comparação, para o professor ver o quanto concorda com a IA.
 * - Os critérios usam a versão revisada pelo professor (criteria_scores) quando existe.
 */

const ATTENTION_CRITERIA_RATIO = 0.5;
const ATTENTION_GRADE = 5;
const MAX_ATTENTION = 10;

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function criteriaOf(row) {
  const scores = parseJson(row.criteria_scores);
  if (Array.isArray(scores)) return scores;
  const parsed = parseJson(row.ai_feedback_json);
  return Array.isArray(parsed?.criterios_avaliacao) ? parsed.criterios_avaliacao : [];
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

const GRADE_BUCKETS = [
  { label: '0 a 2', min: 0, max: 2 },
  { label: '2 a 4', min: 2, max: 4 },
  { label: '4 a 6', min: 4, max: 6 },
  { label: '6 a 8', min: 6, max: 8 },
  { label: '8 a 10', min: 8, max: 10.0001 },
];

export function buildActivityInsights(activity, rows) {
  const totals = {
    students: rows.length,
    with_feedback: 0,
    without_feedback: 0,
    pending: 0,
    edited: 0,
    approved: 0,
  };

  const criteriaMap = new Map();
  const grades = [];
  const gradeDiffs = [];
  let approvedEditedByTeacher = 0;
  let reviewTimed = 0;
  let reviewSeconds = 0;
  const attention = [];
  const objective = { answered: 0, correct: 0, options: {} };
  const aiQuality = { rated: 0, helped: 0, partly: 0, redo: 0 };

  for (const row of rows) {
    if (!row.feedback_id) {
      totals.without_feedback += 1;
      continue;
    }
    totals.with_feedback += 1;
    if (row.status === 'aprovado') totals.approved += 1;
    else if (row.status === 'revisado') totals.edited += 1;
    else totals.pending += 1;

    // Critérios da rubrica
    const criteria = criteriaOf(row);
    let met = 0;
    for (const c of criteria) {
      const name = typeof c?.criterio === 'string' ? c.criterio.trim() : '';
      if (!name) continue;
      const entry = criteriaMap.get(name) || { criterio: name, atendidos: 0, avaliados: 0 };
      entry.avaliados += 1;
      if (c.atendido === true) {
        entry.atendidos += 1;
        met += 1;
      }
      criteriaMap.set(name, entry);
    }

    // Notas
    const teacherGrade = typeof row.teacher_grade === 'number' ? row.teacher_grade : null;
    if (teacherGrade !== null) {
      grades.push(teacherGrade);
      if (typeof row.ai_grade === 'number') gradeDiffs.push(Math.abs(teacherGrade - row.ai_grade));
    }

    // Quanto o professor mudou do rascunho da IA (só nos aprovados)
    if (row.status === 'aprovado') {
      const ai = (row.ai_feedback_text || '').trim();
      const final = (row.teacher_feedback || '').trim();
      if (final && ai && final !== ai) approvedEditedByTeacher += 1;
    }

    // Avaliação do professor sobre o rascunho da IA
    if (row.teacher_rating === 1 || row.teacher_rating === 0 || row.teacher_rating === -1) {
      aiQuality.rated += 1;
      if (row.teacher_rating === 1) aiQuality.helped += 1;
      else if (row.teacher_rating === 0) aiQuality.partly += 1;
      else aiQuality.redo += 1;
    }

    // Tempo de revisão medido na tela de revisão
    if (typeof row.review_seconds === 'number' && row.review_seconds > 0) {
      reviewTimed += 1;
      reviewSeconds += row.review_seconds;
    }

    // Questão objetiva: alternativas escolhidas
    const auto = parseJson(row.auto_result);
    if (auto && typeof auto === 'object') {
      objective.answered += 1;
      if (auto.acertou) objective.correct += 1;
      const letter = auto.escolhida ? String(auto.escolhida) : 'sem resposta';
      objective.options[letter] = (objective.options[letter] || 0) + 1;
    }

    // Alunos que pedem atenção
    const reasons = [];
    if (criteria.length > 0 && met / criteria.length < ATTENTION_CRITERIA_RATIO) {
      reasons.push(`atendeu ${met} de ${criteria.length} critérios`);
    }
    if (teacherGrade !== null && teacherGrade < ATTENTION_GRADE) {
      reasons.push(`nota ${String(teacherGrade).replace('.', ',')}`);
    }
    if (auto && auto.acertou === false) {
      reasons.push('errou a questão objetiva');
    }
    if (reasons.length > 0) {
      attention.push({ response_id: row.id, student_name: row.student_name, reasons });
    }
  }

  const criteria = [...criteriaMap.values()]
    .map((c) => ({ ...c, percent: c.avaliados > 0 ? Math.round((c.atendidos / c.avaliados) * 100) : 0 }))
    .sort((a, b) => a.percent - b.percent || a.criterio.localeCompare(b.criterio, 'pt-BR'));

  const gradeSummary = grades.length > 0
    ? {
        count: grades.length,
        average: round1(grades.reduce((s, g) => s + g, 0) / grades.length),
        min: Math.min(...grades),
        max: Math.max(...grades),
        distribution: GRADE_BUCKETS.map((b) => ({
          label: b.label,
          count: grades.filter((g) => g >= b.min && g < b.max).length,
        })),
      }
    : { count: 0, average: null, min: null, max: null, distribution: GRADE_BUCKETS.map((b) => ({ label: b.label, count: 0 })) };

  return {
    activity_id: activity.id,
    question_type: activity.question_type || 'dissertativa',
    totals,
    criteria,
    weakest_criterion: criteria.length > 0 && criteria[0].percent < 100 ? criteria[0] : null,
    grades: gradeSummary,
    ai_agreement: gradeDiffs.length > 0
      ? {
          compared: gradeDiffs.length,
          average_difference: round1(gradeDiffs.reduce((s, d) => s + d, 0) / gradeDiffs.length),
          within_one_point: gradeDiffs.filter((d) => d <= 1).length,
        }
      : null,
    teacher_edits: {
      approved: totals.approved,
      edited: approvedEditedByTeacher,
      percent: totals.approved > 0 ? Math.round((approvedEditedByTeacher / totals.approved) * 100) : 0,
    },
    ai_quality: aiQuality.rated > 0
      ? { ...aiQuality, helped_percent: Math.round((aiQuality.helped / aiQuality.rated) * 100) }
      : null,
    review_time: {
      timed: reviewTimed,
      total_seconds: reviewSeconds,
      average_seconds: reviewTimed > 0 ? Math.round(reviewSeconds / reviewTimed) : null,
    },
    objective: objective.answered > 0
      ? {
          answered: objective.answered,
          correct: objective.correct,
          percent: Math.round((objective.correct / objective.answered) * 100),
          options: objective.options,
        }
      : null,
    attention: attention
      .sort((a, b) => b.reasons.length - a.reasons.length || a.student_name.localeCompare(b.student_name, 'pt-BR'))
      .slice(0, MAX_ATTENTION),
    attention_total: attention.length,
  };
}

/** Teto do tempo de revisão aceito por envio: evita somar uma aba esquecida aberta. */
export const MAX_REVIEW_SECONDS = 30 * 60;

/** Valida o tempo de revisão enviado pelo client. Inválido vira 0 (não bloqueia a aprovação). */
export function parseReviewSeconds(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), MAX_REVIEW_SECONDS);
}
