/**
 * Evolução da turma ao longo das atividades (GET /api/classes/:id/progress).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-evolucao-turma-32-caracteres!!!!!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';
process.env.FREE_MONTHLY_QUOTA = '100';

const { default: authRouter } = await import('../routes/auth.js');
const { default: classesRouter } = await import('../routes/classes.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { requireAuth } = await import('../middleware/auth.js');
const { getProgress } = await import('../services/queue.js');
const { buildClassProgress } = await import('../services/insights.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/classes', requireAuth, classesRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, feedbackRouter);

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function register(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Prof', email, password: 'SenhaForte@2026' });
  return res.body.token;
}

async function waitJob(id) {
  for (let i = 0; i < 400; i++) {
    const p = getProgress(id);
    if (p.status === 'complete' || p.status === 'error') return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Cria uma atividade na turma, gera os feedbacks e marca os critérios atendidos por aluno. */
async function activityWith(token, classId, title, dueDate, marks) {
  const act = await request(app).post('/api/activities').set(auth(token)).send({
    title, question: 'Q?', rubric: 'R.', classId, dueDate,
    rubricCriteria: [{ criterio: 'Clareza', peso: 1 }, { criterio: 'Argumentação', peso: 1 }],
  });
  await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(token)).send({
    responses: marks.map((_, i) => ({ student_name: `Aluno ${i + 1}`, original_response: 'Uma resposta qualquer sobre o tema.' })),
  }).expect(201);
  await request(app).post(`/api/activities/${act.body.id}/generate`).set(auth(token)).expect(202);
  await waitJob(act.body.id);
  const detail = await request(app).get(`/api/activities/${act.body.id}`).set(auth(token));
  const byName = new Map(detail.body.responses.map((r) => [r.student_name, r.feedback_id]));
  for (let i = 0; i < marks.length; i++) {
    const [clareza, argumentacao] = marks[i];
    await request(app).patch(`/api/feedback/${byName.get(`Aluno ${i + 1}`)}`).set(auth(token)).send({
      criteriaScores: [{ criterio: 'Clareza', atendido: clareza }, { criterio: 'Argumentação', atendido: argumentacao }],
    }).expect(200);
  }
  return act.body.id;
}

describe('evolução da turma', () => {
  test('um ponto por atividade, em ordem de data, e a trajetória dos critérios que se repetem', async () => {
    const token = await register('evo1@escola.dev');
    const cls = await request(app).post('/api/classes').set(auth(token)).send({ name: '8º A' });
    const classId = cls.body.class.id;

    // A segunda criada tem prazo anterior: deve vir primeiro
    const later = await activityWith(token, classId, 'Redação 2', '2026-10-20', [[true, true], [true, false], [true, true], [false, true]]);
    const earlier = await activityWith(token, classId, 'Redação 1', '2026-09-10', [[true, false], [false, false], [true, false], [false, true]]);
    // Atividade sem feedback não entra
    await request(app).post('/api/activities').set(auth(token)).send({ title: 'Sem correção', question: 'Q?', rubric: 'R.', classId });

    const res = await request(app).get(`/api/classes/${classId}/progress`).set(auth(token));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.activities.map((a) => [a.activity_id, a.date, a.criteria_percent]), [
      [earlier, '2026-09-10', 38], // 3 de 8
      [later, '2026-10-20', 75], // 6 de 8
    ]);
    const clareza = res.body.recurring_criteria.find((c) => c.criterio === 'Clareza');
    assert.deepEqual(clareza.points.map((p) => p.percent), [50, 75]);
    assert.equal(clareza.change, 25);
    const argumentacao = res.body.recurring_criteria.find((c) => c.criterio === 'Argumentação');
    assert.equal(argumentacao.change, 50);
    assert.equal(res.body.recurring_criteria[0].criterio, 'Clareza', 'o que menos melhorou vem primeiro');
  });

  test('só o professor dono vê; turma sem atividades corrigidas volta vazia', async () => {
    const token = await register('evo2@escola.dev');
    const other = await register('evo3@escola.dev');
    const cls = await request(app).post('/api/classes').set(auth(token)).send({ name: '9º B' });
    assert.equal((await request(app).get(`/api/classes/${cls.body.class.id}/progress`).set(auth(other))).status, 404);
    const empty = await request(app).get(`/api/classes/${cls.body.class.id}/progress`).set(auth(token));
    assert.deepEqual(empty.body.activities, []);
    assert.deepEqual(empty.body.recurring_criteria, []);
  });

  test('critério com o mesmo nome escrito diferente (acento, maiúscula) é o mesmo critério', () => {
    const mk = (id, date, name, ok) => ({
      activity: { id, title: `A${id}`, due_date: date },
      rows: [{ id, student_name: 'X', feedback_id: id, status: 'aprovado', criteria_scores: JSON.stringify([{ criterio: name, atendido: ok }]) }],
    });
    const out = buildClassProgress([mk(1, '2026-01-01', 'Argumentação', false), mk(2, '2026-02-01', ' argumentacao ', true)]);
    assert.equal(out.recurring_criteria.length, 1);
    assert.deepEqual(out.recurring_criteria[0].points.map((p) => p.percent), [0, 100]);
  });

  test('múltipla escolha entra pelos acertos, não por critérios', () => {
    const out = buildClassProgress([{
      activity: { id: 1, title: 'Quiz', question_type: 'objetiva', created_at: '2026-01-01' },
      rows: [
        { id: 1, student_name: 'A', feedback_id: 1, status: 'pendente', auto_result: JSON.stringify({ escolhida: 'B', acertou: true }), criteria_scores: JSON.stringify([{ criterio: 'Alternativa', atendido: true }]) },
        { id: 2, student_name: 'B', feedback_id: 2, status: 'pendente', auto_result: JSON.stringify({ escolhida: 'C', acertou: false }), criteria_scores: JSON.stringify([{ criterio: 'Alternativa', atendido: false }]) },
      ],
    }]);
    assert.equal(out.activities[0].criteria_percent, null);
    assert.equal(out.activities[0].objective_percent, 50);
    assert.deepEqual(out.recurring_criteria, []);
  });
});
