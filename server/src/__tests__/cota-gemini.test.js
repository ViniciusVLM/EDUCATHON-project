/**
 * Uso da cota do Gemini: uma chamada por aluno em provas com várias perguntas e parada imediata
 * quando a cota diária (ex.: plano gratuito) acaba.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-cota-gemini-32-caracteres!!!!!!!!';
process.env.GEMINI_MOCK = 'false';
process.env.GEMINI_API_KEY = 'AIzaChaveFalsaParaTestes1234567890123';
process.env.NODE_ENV = 'test';
process.env.FREE_MONTHLY_QUOTA = '50';
delete process.env.GEMINI_FALLBACK_MODEL;

const { default: authRouter } = await import('../routes/auth.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { requireAuth } = await import('../middleware/auth.js');
const { getProgress } = await import('../services/queue.js');
const { setModel, resetModel, isDailyQuotaError } = await import('../services/gemini.js');
const { getDb } = await import('../database/db.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, feedbackRouter);

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const usage = () => getDb().prepare("SELECT COALESCE(SUM(units),0) AS u FROM ai_usage WHERE kind = 'feedback'").get().u;

function dailyError() {
  const e = new Error('[429] You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20. Please retry in 4h18m31.230962491s.');
  e.status = 429;
  return e;
}

async function waitJob(id) {
  for (let i = 0; i < 400; i++) {
    const p = getProgress(id);
    if (p.status === 'complete' || p.status === 'error') return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job não terminou');
}

async function setup(email, body, responses) {
  const reg = await request(app).post('/api/auth/register').send({ name: 'Prof', email, password: 'SenhaForte@2026' });
  const token = reg.body.token;
  const act = await request(app).post('/api/activities').set(auth(token)).send(body);
  await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(token)).send({ responses }).expect(201);
  return { token, id: act.body.id };
}

afterEach(() => resetModel());

describe('reconhece a cota diária esgotada', () => {
  test('pedido de espera de horas é cota diária; de segundos não', () => {
    assert.equal(isDailyQuotaError(dailyError()), true);
    const minute = new Error('[429] Resource exhausted. Please retry in 21s.');
    minute.status = 429;
    assert.equal(isDailyQuotaError(minute), false);
    assert.equal(isDailyQuotaError(new Error('429 quota exceeded for GenerateRequestsPerDayPerProjectPerModel')), true);
    assert.equal(isDailyQuotaError(new Error('500 internal')), false);
  });
});

describe('processamento com a IA de verdade', () => {
  test('prova com várias perguntas: uma chamada por aluno e nota sugerida por questão', async () => {
    const calls = [];
    setModel({
      async generateContent({ contents }) {
        const prompt = contents[0].parts[0].text;
        calls.push(prompt);
        const nums = [...prompt.matchAll(/### QUESTÃO (\d+)/g)].map((m) => Number(m[1]));
        const questoes = nums.map((n) => ({
          numero: n, pontos_fortes: `pf${n}`, lacunas: `l${n}`, sugestao_melhoria: `s${n}`,
          feedback_completo: `Feedback da questão ${n}.`, nota_sugerida: 8, justificativa_nota: `j${n}`,
        }));
        return { response: { text: () => JSON.stringify({ questoes }) } };
      },
    });
    const { token, id } = await setup('cota1@escola.dev', {
      title: 'Prova', question: 'P1?', rubric: 'R1.', aiGradeEnabled: true,
      extraQuestions: [{ question: 'P2?', rubric: 'R2.' }, { question: 'P3?', rubric: 'R3.' }],
    }, [
      { student_name: 'Ana', answers: ['a1', 'a2', 'a3'] },
      { student_name: 'Beto', answers: ['b1', '', 'b3'] },
    ]);
    await request(app).post(`/api/activities/${id}/generate`).set(auth(token)).expect(202);
    const p = await waitJob(id);
    assert.equal(p.errors, 0);
    assert.equal(calls.length, 2, 'uma chamada por aluno, não por questão');
    const betoPrompt = calls.find((c) => c.includes('b1'));
    assert.doesNotMatch(betoPrompt, /### QUESTÃO 2/, 'questão em branco não vai para a IA');
    assert.match(betoPrompt, /SUGESTÃO DE NOTA/);

    const detail = await request(app).get(`/api/activities/${id}`).set(auth(token));
    const beto = detail.body.responses.find((r) => r.student_name === 'Beto');
    assert.match(beto.ai_feedback_text, /Questão 1\nFeedback da questão 1\./);
    assert.match(beto.ai_feedback_text, /Questão 3\nFeedback da questão 3\./);
    assert.equal(beto.ai_grade, 5.5, 'média de 8, 0 (em branco) e 8 = 5,33 → 5,5');
  });

  test('cota diária acaba: para na hora, devolve a cota e explica o motivo', async () => {
    let calls = 0;
    setModel({ async generateContent() { calls++; throw dailyError(); } });
    const responses = Array.from({ length: 5 }, (_, i) => ({ student_name: `Aluno ${i}`, original_response: 'A planta usa luz.' }));
    const { token, id } = await setup('cota2@escola.dev', { title: 'A', question: 'P?', rubric: 'R.' }, responses);
    const before = usage();
    await request(app).post(`/api/activities/${id}/generate`).set(auth(token)).expect(202);
    const p = await waitJob(id);
    assert.equal(p.status, 'error');
    assert.equal(p.last_error, 'gemini_daily_quota');
    assert.equal(calls, 1, 'não tenta de novo nem passa para os outros alunos');
    assert.equal(usage(), before, 'a cota reservada do Educathon volta');

    const prog = await request(app).get(`/api/activities/${id}/progress`).set(auth(token));
    assert.equal(prog.body.last_error, 'gemini_daily_quota');

    // Um novo processamento limpa o motivo antigo
    resetModel();
    setModel({
      async generateContent() {
        return { response: { text: () => JSON.stringify({ pontos_fortes: 'a', lacunas: 'b', sugestao_melhoria: 'c', feedback_completo: 'd' }) } };
      },
    });
    await request(app).post(`/api/activities/${id}/generate`).set(auth(token)).expect(202);
    const p2 = await waitJob(id);
    assert.equal(p2.status, 'complete');
    assert.equal(p2.last_error, null);
  });
});
