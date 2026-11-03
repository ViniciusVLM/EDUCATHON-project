/**
 * Sugestão de retomada em aula (POST /api/activities/:id/class-plan).
 * A IA só recebe dados agregados da turma: nenhum nome ou resposta de aluno.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-retomada-aula-32-caracteres!!!!!!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';
process.env.FREE_MONTHLY_QUOTA = '100';

const { default: authRouter } = await import('../routes/auth.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { requireAuth } = await import('../middleware/auth.js');
const { getProgress } = await import('../services/queue.js');
const { setModel, resetModel } = await import('../services/gemini.js');
const { getDb } = await import('../database/db.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, feedbackRouter);

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const usage = (teacherId) =>
  getDb().prepare("SELECT COALESCE(SUM(units),0) AS u FROM ai_usage WHERE teacher_id = ? AND kind = 'feedback'").get(teacherId).u;

afterEach(() => resetModel());

async function setup(email, { criteria = true } = {}) {
  const reg = await request(app).post('/api/auth/register').send({ name: 'Prof', email, password: 'SenhaForte@2026' });
  const token = reg.body.token;
  const act = await request(app).post('/api/activities').set(auth(token)).send({
    title: 'Ciclo da água',
    question: 'Explique o ciclo da água.',
    rubric: 'Evaporação, condensação e precipitação.',
    subject: 'Ciências',
    ...(criteria ? { rubricCriteria: [{ criterio: 'Evaporação', peso: 1 }, { criterio: 'Condensação', peso: 1 }] } : {}),
  });
  await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(token)).send({
    responses: [
      { student_name: 'Joana Secreta', original_response: 'Chove.' },
      { student_name: 'Pedro Sigiloso', original_response: 'A água evapora com o sol e depois condensa nas nuvens e cai como chuva.' },
    ],
  }).expect(201);
  await request(app).post(`/api/activities/${act.body.id}/generate`).set(auth(token)).expect(202);
  for (let i = 0; i < 400; i++) {
    const p = getProgress(act.body.id);
    if (p.status === 'complete' || p.status === 'error') break;
    await new Promise((r) => setTimeout(r, 10));
  }
  return { token, id: act.body.id, teacherId: reg.body.teacher.id };
}

describe('sugestão de retomada em aula', () => {
  test('modo demonstração: devolve sugestões para o critério mais fraco e gasta 1 geração', async () => {
    const { token, id, teacherId } = await setup('ret1@escola.dev');
    const before = usage(teacherId);
    const res = await request(app).post(`/api/activities/${id}/class-plan`).set(auth(token));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.criteria.length >= 1);
    assert.ok(res.body.criteria.every((c) => c.percent < 100));
    assert.match(res.body.resumo, new RegExp(res.body.criteria[0].criterio));
    assert.equal(res.body.sugestoes.length, 3);
    assert.equal(usage(teacherId) - before, 1);
  });

  test('com a IA de verdade: o prompt só tem dados agregados, sem nomes nem respostas', async () => {
    const { token, id } = await setup('ret2@escola.dev');
    let prompt = '';
    let system = '';
    setModel({
      async generateContent({ contents, generationConfig }) {
        prompt = contents[0].parts[0].text;
        system = generationConfig.systemInstruction || '';
        return {
          response: {
            text: () => JSON.stringify({
              resumo: 'A turma precisa retomar condensação.',
              sugestoes: [
                { titulo: 'Experimento', como_fazer: 'Use um copo com gelo.', tempo_minutos: 200 },
                { titulo: 'Desenho', como_fazer: 'Desenhem o ciclo.', tempo_minutos: 10 },
                { titulo: 'inválida' },
              ],
            }),
          },
        };
      },
    });
    const res = await request(app).post(`/api/activities/${id}/class-plan`).set(auth(token));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.doesNotMatch(prompt, /Joana|Pedro|Secreta|Sigiloso/, 'nenhum nome de aluno vai para a IA');
    assert.doesNotMatch(prompt, /Chove\./, 'nenhuma resposta de aluno vai para a IA');
    assert.match(prompt, /alunos atenderam \(\d+%\)/);
    assert.match(prompt, /<enunciado>[\s\S]*Explique o ciclo da água/);
    assert.match(system, /NUNCA cite alunos/);
    assert.equal(res.body.sugestoes.length, 2, 'sugestão incompleta é descartada');
    assert.equal(res.body.sugestoes[0].tempo_minutos, 90, 'tempo fica entre 5 e 90 minutos');
  });

  test('se a IA falhar, a cota volta e o erro é amigável', async () => {
    const { token, id, teacherId } = await setup('ret3@escola.dev');
    setModel({ async generateContent() { throw new Error('400 bad request'); } });
    const before = usage(teacherId);
    const res = await request(app).post(`/api/activities/${id}/class-plan`).set(auth(token));
    assert.equal(res.status, 500);
    assert.match(res.body.error, /Tente de novo/);
    assert.equal(usage(teacherId), before);
  });

  test('sem critérios avaliados, explica o que fazer; e respeita o dono da atividade', async () => {
    const { token, id } = await setup('ret4@escola.dev', { criteria: false });
    // Sem rubric_criteria o mock não avalia critérios
    getDb().prepare('UPDATE feedbacks SET criteria_scores = NULL, ai_feedback_json = NULL').run();
    const res = await request(app).post(`/api/activities/${id}/class-plan`).set(auth(token));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /critérios/);

    const other = await request(app).post('/api/auth/register').send({ name: 'Outro', email: 'ret5@escola.dev', password: 'SenhaForte@2026' });
    assert.equal((await request(app).post(`/api/activities/${id}/class-plan`).set(auth(other.body.token))).status, 404);
  });
});
