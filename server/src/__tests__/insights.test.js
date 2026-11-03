/**
 * Diagnóstico da turma, aprovação em lote, tempo de revisão e arquivamento de atividades.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-diagnostico-turma-32-caracteres!!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';
process.env.FREE_MONTHLY_QUOTA = '100';

const { default: authRouter } = await import('../routes/auth.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { default: dashboardRouter } = await import('../routes/dashboard.js');
const { requireAuth } = await import('../middleware/auth.js');
const { getProgress } = await import('../services/queue.js');
const { buildActivityInsights, parseReviewSeconds, MAX_REVIEW_SECONDS } = await import('../services/insights.js');
const { getDb } = await import('../database/db.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, feedbackRouter);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function registerTeacher(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Prof Diagnóstico', email, password: 'SenhaForte@2026' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.token;
}

async function waitJob(activityId) {
  for (let i = 0; i < 600; i++) {
    const p = getProgress(activityId);
    if (p.status === 'complete' || p.status === 'error') return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job não terminou');
}

async function createActivityWithFeedbacks(token, responses) {
  const created = await request(app).post('/api/activities').set(auth(token)).send({
    title: 'Ciclo da água',
    question: 'Explique o ciclo da água.',
    rubric: 'Evaporação, condensação e precipitação.',
    educationLevel: 'fundamental',
    rubricCriteria: [
      { criterio: 'Evaporação', peso: 1 },
      { criterio: 'Condensação', peso: 1 },
      { criterio: 'Precipitação', peso: 1 },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  const added = await request(app).post(`/api/activities/${id}/manual`).set(auth(token)).send({ responses });
  assert.ok([200, 201].includes(added.status), JSON.stringify(added.body));
  const gen = await request(app).post(`/api/activities/${id}/generate`).set(auth(token));
  assert.equal(gen.status, 202, JSON.stringify(gen.body));
  await waitJob(id);
  const detail = await request(app).get(`/api/activities/${id}`).set(auth(token));
  return { id, detail: detail.body };
}

const RESPONSES = [
  { student_name: 'Ana', original_response: 'A água evapora com o calor do sol, forma nuvens pela condensação do vapor e volta como chuva na precipitação, reiniciando o ciclo.' },
  { student_name: 'Bruno', original_response: 'Chove.' },
  { student_name: 'Carla', original_response: 'O sol aquece rios e mares, a água evapora, o vapor sobe e esfria formando nuvens, depois cai como chuva ou neve.' },
];

// ── Função pura ─────────────────────────────────────────────────────────────

describe('buildActivityInsights', () => {
  const activity = { id: 1, question_type: 'dissertativa' };
  const crit = (a, b) => JSON.stringify([
    { criterio: 'Evaporação', atendido: a },
    { criterio: 'Condensação', atendido: b },
  ]);

  test('conta status, critérios (do mais fraco ao mais forte) e alunos que pedem atenção', () => {
    const rows = [
      { id: 1, student_name: 'Ana', feedback_id: 10, status: 'aprovado', criteria_scores: crit(true, true), teacher_grade: 9, ai_grade: 8.5, ai_feedback_text: 'Rascunho', teacher_feedback: 'Rascunho', review_seconds: 40 },
      { id: 2, student_name: 'Bruno', feedback_id: 11, status: 'pendente', criteria_scores: crit(false, false), teacher_grade: 3, ai_grade: 6 },
      { id: 3, student_name: 'Carla', feedback_id: 12, status: 'revisado', criteria_scores: crit(true, false), teacher_grade: null },
      { id: 4, student_name: 'Davi', feedback_id: null },
    ];
    const out = buildActivityInsights(activity, rows);

    assert.deepEqual(out.totals, { students: 4, with_feedback: 3, without_feedback: 1, pending: 1, edited: 1, approved: 1 });
    assert.deepEqual(out.criteria.map((c) => [c.criterio, c.atendidos, c.avaliados, c.percent]), [
      ['Condensação', 1, 3, 33],
      ['Evaporação', 2, 3, 67],
    ]);
    assert.equal(out.weakest_criterion.criterio, 'Condensação');
    assert.equal(out.grades.count, 2);
    assert.equal(out.grades.average, 6);
    assert.equal(out.grades.distribution.find((b) => b.label === '8 a 10').count, 1);
    assert.equal(out.grades.distribution.find((b) => b.label === '2 a 4').count, 1);
    assert.deepEqual(out.ai_agreement, { compared: 2, average_difference: 1.8, within_one_point: 1 });
    assert.deepEqual(out.review_time, { timed: 1, total_seconds: 40, average_seconds: 40 });
    assert.equal(out.teacher_edits.edited, 0);
    assert.equal(out.attention_total, 1);
    assert.equal(out.attention[0].student_name, 'Bruno');
    assert.ok(out.attention[0].reasons.some((r) => /0 de 2 critérios/.test(r)));
    assert.ok(out.attention[0].reasons.some((r) => /nota 3/.test(r)));
  });

  test('usa os critérios do rascunho da IA quando o professor ainda não revisou', () => {
    const rows = [{
      id: 1, student_name: 'Ana', feedback_id: 1, status: 'pendente', criteria_scores: null,
      ai_feedback_json: JSON.stringify({ criterios_avaliacao: [{ criterio: 'Clareza', atendido: true }] }),
    }];
    const out = buildActivityInsights(activity, rows);
    assert.deepEqual(out.criteria, [{ criterio: 'Clareza', atendidos: 1, avaliados: 1, percent: 100 }]);
    assert.equal(out.weakest_criterion, null, 'critério 100% atendido não é ponto fraco');
  });

  test('sem dados não quebra e devolve valores vazios', () => {
    const out = buildActivityInsights(activity, []);
    assert.equal(out.totals.students, 0);
    assert.deepEqual(out.criteria, []);
    assert.equal(out.grades.average, null);
    assert.equal(out.ai_agreement, null);
    assert.equal(out.objective, null);
    assert.equal(out.review_time.average_seconds, null);
  });

  test('questão objetiva: acertos e alternativas escolhidas', () => {
    const rows = [
      { id: 1, student_name: 'Ana', feedback_id: 1, status: 'pendente', auto_result: JSON.stringify({ escolhida: 'B', correta: 'B', acertou: true }) },
      { id: 2, student_name: 'Bia', feedback_id: 2, status: 'pendente', auto_result: JSON.stringify({ escolhida: 'C', correta: 'B', acertou: false }) },
    ];
    const out = buildActivityInsights({ id: 2, question_type: 'objetiva' }, rows);
    assert.deepEqual(out.objective, { answered: 2, correct: 1, percent: 50, options: { B: 1, C: 1 } });
    assert.equal(out.attention[0].student_name, 'Bia');
  });

  test('parseReviewSeconds aceita só números positivos e limita o teto', () => {
    assert.equal(parseReviewSeconds(42.4), 42);
    assert.equal(parseReviewSeconds('30'), 30);
    assert.equal(parseReviewSeconds(-5), 0);
    assert.equal(parseReviewSeconds('abc'), 0);
    assert.equal(parseReviewSeconds(undefined), 0);
    assert.equal(parseReviewSeconds(99999), MAX_REVIEW_SECONDS);
  });
});

// ── Rotas ───────────────────────────────────────────────────────────────────

describe('rotas de diagnóstico, aprovação em lote e arquivamento', () => {
  test('GET /insights devolve o diagnóstico e respeita o dono da atividade', async () => {
    const token = await registerTeacher('diag1@escola.dev');
    const other = await registerTeacher('diag2@escola.dev');
    const { id } = await createActivityWithFeedbacks(token, RESPONSES);

    const res = await request(app).get(`/api/activities/${id}/insights`).set(auth(token));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.totals.students, 3);
    assert.equal(res.body.totals.with_feedback, 3);
    assert.equal(res.body.criteria.length, 3);
    assert.ok(res.body.criteria.every((c) => c.avaliados === 3));

    const alheio = await request(app).get(`/api/activities/${id}/insights`).set(auth(other));
    assert.equal(alheio.status, 404);
    const semLogin = await request(app).get(`/api/activities/${id}/insights`);
    assert.equal(semLogin.status, 401);
  });

  test('aprovar com reviewSeconds guarda o tempo e ele aparece no diagnóstico', async () => {
    const token = await registerTeacher('diag3@escola.dev');
    const { id, detail } = await createActivityWithFeedbacks(token, RESPONSES);
    const fb = detail.responses[0].feedback_id;

    const ok = await request(app).post(`/api/feedback/${fb}/approve`).set(auth(token)).send({ reviewSeconds: 75 });
    assert.equal(ok.status, 200);
    // Um valor inválido não impede a aprovação
    const fb2 = detail.responses[1].feedback_id;
    const ok2 = await request(app).post(`/api/feedback/${fb2}/approve`).set(auth(token)).send({ reviewSeconds: 'xx' });
    assert.equal(ok2.status, 200);

    const insights = await request(app).get(`/api/activities/${id}/insights`).set(auth(token));
    assert.deepEqual(insights.body.review_time, { timed: 1, total_seconds: 75, average_seconds: 75 });
    assert.equal(insights.body.totals.approved, 2);

    const summary = await request(app).get('/api/dashboard/summary').set(auth(token));
    assert.equal(summary.body.metrics.avg_review_seconds, 75, 'o painel mostra a revisão média');
  });

  test('aprovar sem corpo continua funcionando (compatível com o client antigo)', async () => {
    const token = await registerTeacher('diag4@escola.dev');
    const { detail } = await createActivityWithFeedbacks(token, RESPONSES.slice(0, 1));
    const res = await request(app).post(`/api/feedback/${detail.responses[0].feedback_id}/approve`).set(auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'aprovado');
  });

  test('POST /approve-all aprova todos numa chamada, mantém o texto editado e respeita o dono', async () => {
    const token = await registerTeacher('diag5@escola.dev');
    const other = await registerTeacher('diag6@escola.dev');
    const { id, detail } = await createActivityWithFeedbacks(token, RESPONSES);

    const edited = detail.responses[0].feedback_id;
    await request(app).patch(`/api/feedback/${edited}`).set(auth(token)).send({ teacherFeedback: 'Texto do professor.' });

    const alheio = await request(app).post(`/api/activities/${id}/approve-all`).set(auth(other));
    assert.equal(alheio.status, 404);

    const res = await request(app).post(`/api/activities/${id}/approve-all`).set(auth(token));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.approved, 3);

    const after = await request(app).get(`/api/activities/${id}`).set(auth(token));
    assert.ok(after.body.responses.every((r) => r.status === 'aprovado'));
    const e = after.body.responses.find((r) => r.feedback_id === edited);
    assert.equal(e.teacher_feedback, 'Texto do professor.');
    const untouched = after.body.responses.find((r) => r.feedback_id !== edited);
    assert.equal(untouched.teacher_feedback, untouched.ai_feedback_text, 'sem edição, o texto final é o rascunho da IA');
    assert.equal(untouched.teacher_grade, null, 'aprovar em lote nunca lança nota');

    const again = await request(app).post(`/api/activities/${id}/approve-all`).set(auth(token));
    assert.equal(again.body.approved, 0);
  });

  test('POST /approve-all recusa enquanto a geração está em andamento', async () => {
    const token = await registerTeacher('diag7@escola.dev');
    const { id } = await createActivityWithFeedbacks(token, RESPONSES.slice(0, 1));
    getDb().prepare("UPDATE processing_jobs SET status = 'processing' WHERE activity_id = ?").run(id);
    const res = await request(app).post(`/api/activities/${id}/approve-all`).set(auth(token));
    assert.equal(res.status, 409);
    getDb().prepare("UPDATE processing_jobs SET status = 'complete' WHERE activity_id = ?").run(id);
  });

  test('PATCH /archive tira a atividade do painel sem apagar e pode reativar', async () => {
    const token = await registerTeacher('diag8@escola.dev');
    const other = await registerTeacher('diag9@escola.dev');
    const { id } = await createActivityWithFeedbacks(token, RESPONSES.slice(0, 1));

    const before = await request(app).get('/api/dashboard/summary').set(auth(token));
    assert.equal(before.body.metrics.total_activities, 1);

    assert.equal((await request(app).patch(`/api/activities/${id}/archive`).set(auth(token)).send({ archived: 'sim' })).status, 400);
    assert.equal((await request(app).patch(`/api/activities/${id}/archive`).set(auth(other)).send({ archived: true })).status, 404);

    const arch = await request(app).patch(`/api/activities/${id}/archive`).set(auth(token)).send({ archived: true });
    assert.equal(arch.status, 200);
    const mid = await request(app).get('/api/dashboard/summary').set(auth(token));
    assert.equal(mid.body.metrics.total_activities, 0);
    const stillThere = await request(app).get(`/api/activities/${id}`).set(auth(token));
    assert.equal(stillThere.status, 200);
    assert.equal(stillThere.body.is_archived, 1);
    assert.equal(stillThere.body.responses.length, 1, 'arquivar não apaga as respostas');

    await request(app).patch(`/api/activities/${id}/archive`).set(auth(token)).send({ archived: false });
    const after = await request(app).get('/api/dashboard/summary').set(auth(token));
    assert.equal(after.body.metrics.total_activities, 1);
  });
  test('CSV exportado ganha uma coluna por critério (sim/não), depois das colunas de sempre', async () => {
    const token = await registerTeacher('diag10@escola.dev');
    const { id, detail } = await createActivityWithFeedbacks(token, RESPONSES);
    const ana = detail.responses.find((r) => r.student_name === 'Ana');
    await request(app).patch(`/api/feedback/${ana.feedback_id}`).set(auth(token)).send({
      criteriaScores: [
        { criterio: 'Evaporação', atendido: true },
        { criterio: 'Condensação', atendido: false },
        { criterio: 'Precipitação', atendido: true },
      ],
    }).expect(200);

    const res = await request(app).get(`/api/activities/${id}/export`).set(auth(token));
    assert.equal(res.status, 200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\n');
    assert.equal(
      lines[0],
      'nome_aluno,resposta_original,feedback_final,nota,status,"criterio: Evaporação","criterio: Condensação","criterio: Precipitação"'
    );
    const anaLine = lines.find((l) => l.startsWith('"Ana"'));
    assert.ok(anaLine.endsWith('"sim","não","sim"'), anaLine);
    assert.equal(lines.length, 4);
  });
  test('CSV de múltipla escolha traz a alternativa escolhida e se acertou', async () => {
    const token = await registerTeacher('diag11@escola.dev');
    const created = await request(app).post('/api/activities').set(auth(token)).send({
      title: 'Quiz', question: 'Qual?', rubric: '', questionType: 'objetiva',
      options: [{ texto: 'um' }, { texto: 'dois' }], correctOption: 'B',
    });
    const id = created.body.id;
    await request(app).post(`/api/activities/${id}/manual`).set(auth(token)).send({
      responses: [{ student_name: 'Ana', original_response: 'B' }, { student_name: 'Bia', original_response: 'A' }],
    });
    await request(app).post(`/api/activities/${id}/generate`).set(auth(token)).expect(202);
    await waitJob(id);
    const res = await request(app).get(`/api/activities/${id}/export`).set(auth(token));
    const lines = res.text.replace(/^\uFEFF/, '').split('\n');
    assert.ok(lines[0].endsWith(',alternativa_escolhida,acertou'), lines[0]);
    assert.ok(lines.find((l) => l.startsWith('"Ana"')).endsWith('"B","sim"'));
    assert.ok(lines.find((l) => l.startsWith('"Bia"')).endsWith('"A","não"'));

    const insights = await request(app).get(`/api/activities/${id}/insights`).set(auth(token));
    assert.equal(insights.body.objective.percent, 50);
  });
  test('POST /duplicate copia a atividade sem respostas e respeita turma e dono', async () => {
    const token = await registerTeacher('diag12@escola.dev');
    const other = await registerTeacher('diag13@escola.dev');
    const { id } = await createActivityWithFeedbacks(token, RESPONSES.slice(0, 1));
    assert.equal((await request(app).post(`/api/activities/${id}/duplicate`).set(auth(other))).status, 404);
    assert.equal((await request(app).post(`/api/activities/${id}/duplicate`).set(auth(token)).send({ classId: 99999 })).status, 404);
    assert.equal((await request(app).post(`/api/activities/${id}/duplicate`).set(auth(token)).send({ title: '' })).status, 400);

    const dup = await request(app).post(`/api/activities/${id}/duplicate`).set(auth(token));
    assert.equal(dup.status, 201, JSON.stringify(dup.body));
    const copy = await request(app).get(`/api/activities/${dup.body.id}`).set(auth(token));
    const orig = await request(app).get(`/api/activities/${id}`).set(auth(token));
    assert.equal(copy.body.title, 'Ciclo da água (cópia)');
    for (const field of ['question', 'rubric', 'education_level', 'rubric_criteria', 'question_type']) {
      assert.deepEqual(copy.body[field], orig.body[field], field);
    }
    assert.equal(copy.body.responses.length, 0, 'não copia respostas');
    assert.equal(copy.body.due_date, null);
  });

  test('POST /duplicate mantém perguntas extras e alternativas', async () => {
    const token = await registerTeacher('diag14@escola.dev');
    const multi = await request(app).post('/api/activities').set(auth(token)).send({
      title: 'Prova', question: 'P1?', rubric: 'R1.', extraQuestions: [{ question: 'P2?', rubric: 'R2.' }],
    });
    const dupMulti = await request(app).post(`/api/activities/${multi.body.id}/duplicate`).set(auth(token)).send({ title: 'Prova 2' });
    const copyMulti = await request(app).get(`/api/activities/${dupMulti.body.id}`).set(auth(token));
    assert.equal(copyMulti.body.title, 'Prova 2');
    assert.equal(JSON.parse(copyMulti.body.questions).length, 2);

    const quiz = await request(app).post('/api/activities').set(auth(token)).send({
      title: 'Quiz', question: 'Qual?', rubric: '', questionType: 'objetiva',
      options: [{ texto: 'um' }, { texto: 'dois' }], correctOption: 'B',
    });
    const dupQuiz = await request(app).post(`/api/activities/${quiz.body.id}/duplicate`).set(auth(token));
    const copyQuiz = await request(app).get(`/api/activities/${dupQuiz.body.id}`).set(auth(token));
    assert.equal(copyQuiz.body.question_type, 'objetiva');
    assert.equal(copyQuiz.body.correct_option, 'B');
    assert.equal(JSON.parse(copyQuiz.body.options).length, 2);
  });
  test('avaliar o rascunho da IA não muda o status e aparece no diagnóstico', async () => {
    const token = await registerTeacher('diag15@escola.dev');
    const { id, detail } = await createActivityWithFeedbacks(token, RESPONSES);
    const [a, b, c] = detail.responses.map((r) => r.feedback_id);
    await request(app).post(`/api/feedback/${a}/approve`).set(auth(token)).expect(200);

    const r1 = await request(app).patch(`/api/feedback/${a}`).set(auth(token)).send({ teacherRating: 1 });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.status, 'aprovado', 'avaliar não desfaz a aprovação');
    await request(app).patch(`/api/feedback/${b}`).set(auth(token)).send({ teacherRating: -1 }).expect(200);
    await request(app).patch(`/api/feedback/${c}`).set(auth(token)).send({ teacherRating: 0 }).expect(200);
    assert.equal((await request(app).patch(`/api/feedback/${c}`).set(auth(token)).send({ teacherRating: 5 })).status, 400);

    const after = await request(app).get(`/api/activities/${id}`).set(auth(token));
    assert.equal(after.body.responses.find((r) => r.feedback_id === b).status, 'pendente');

    const insights = await request(app).get(`/api/activities/${id}/insights`).set(auth(token));
    assert.deepEqual(insights.body.ai_quality, { rated: 3, helped: 1, partly: 1, redo: 1, helped_percent: 33 });

    // null apaga a avaliação
    await request(app).patch(`/api/feedback/${c}`).set(auth(token)).send({ teacherRating: null }).expect(200);
    const again = await request(app).get(`/api/activities/${id}/insights`).set(auth(token));
    assert.equal(again.body.ai_quality.rated, 2);
  });
});
