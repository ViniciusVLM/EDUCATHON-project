/**
 * Nota sugerida pela IA: opcional por atividade, vista só pelo professor,
 * nunca substitui a nota lançada (teacher_grade).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-nota-sugerida-32-caracteres!!!!!!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';
process.env.FREE_MONTHLY_QUOTA = '50';

const { default: authRouter } = await import('../routes/auth.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { requireAuth } = await import('../middleware/auth.js');
const { getProgress, combineSuggestedGrades } = await import('../services/queue.js');
const { buildUserPrompt, getFeedbackSchema, normalizeSuggestedGrade, SYSTEM_INSTRUCTION } =
  await import('../prompts/feedback.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, feedbackRouter);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function registerTeacher(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Prof Nota', email, password: 'SenhaForte@2026' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.token;
}

async function waitJob(activityId) {
  for (let i = 0; i < 400; i++) {
    const p = getProgress(activityId);
    if (p.status === 'complete' || p.status === 'error') return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job não terminou');
}

const BASE = {
  title: 'Fotossíntese',
  question: 'Explique a fotossíntese.',
  rubric: 'Luz, água e CO2 viram glicose e oxigênio.',
  educationLevel: 'medio',
};

const RESPONSES = [
  { student_name: 'Ana', original_response: 'A planta usa luz, água e gás carbônico para produzir glicose e liberar oxigênio, que é a base da cadeia alimentar.' },
  { student_name: 'Beto', original_response: 'Planta come sol.' },
];

describe('prompt e schema da nota sugerida', () => {
  test('sem a opção, o prompt não pede nota e o schema não tem nota', () => {
    const prompt = buildUserPrompt({ studentName: 'Ana', question: 'q', rubric: 'r', studentResponse: 'x' });
    assert.doesNotMatch(prompt, /SUGESTÃO DE NOTA/);
    assert.equal(getFeedbackSchema(null).properties.nota_sugerida, undefined);
  });

  test('com a opção, pede nota 0 a 10 só para o professor e exige os campos', () => {
    const prompt = buildUserPrompt({ studentName: 'Ana', question: 'q', rubric: 'r', studentResponse: 'x', suggestGrade: true });
    assert.match(prompt, /SUGESTÃO DE NOTA PARA O PROFESSOR/);
    assert.match(prompt, /NUNCA pode aparecer nos textos do feedback/);
    const schema = getFeedbackSchema([{ criterio: 'c', peso: 1 }], { suggestGrade: true });
    assert.ok(schema.required.includes('nota_sugerida'));
    assert.ok(schema.required.includes('criterios_avaliacao'));
    assert.match(SYSTEM_INSTRUCTION, /NUNCA escreva nota/);
  });

  test('normaliza a nota para 0 a 10 com meio ponto', () => {
    assert.equal(normalizeSuggestedGrade(11), 10);
    assert.equal(normalizeSuggestedGrade(-2), 0);
    assert.equal(normalizeSuggestedGrade(7.3), 7.5);
    assert.equal(normalizeSuggestedGrade('6,8'), 7);
    assert.equal(normalizeSuggestedGrade('abc'), null);
    assert.equal(normalizeSuggestedGrade(undefined), null);
  });

  test('várias questões: média simples, questão em branco conta zero', () => {
    const g = combineSuggestedGrades([
      { nota_sugerida: 9, justificativa_nota: 'boa' },
      { sem_resposta: true },
      { nota_sugerida: 6, justificativa_nota: 'parcial' },
    ]);
    assert.equal(g.nota, 5);
    assert.match(g.justificativa, /Q2 \(0\): em branco/);
    assert.equal(combineSuggestedGrades([{ nota_sugerida: 'x' }]), null);
  });
});

describe('fluxo da nota sugerida', () => {
  test('ligada: guarda a sugestão sem tocar na nota do professor', async () => {
    const token = await registerTeacher('nota1@escola.dev');
    const created = await request(app).post('/api/activities').set(auth(token)).send({ ...BASE, aiGradeEnabled: true });
    assert.equal(created.status, 201);
    const id = created.body.id;
    await request(app).post(`/api/activities/${id}/manual`).set(auth(token)).send({ responses: RESPONSES }).expect(201);
    await request(app).post(`/api/activities/${id}/generate`).set(auth(token)).expect(202);
    assert.equal((await waitJob(id)).errors, 0);

    const detail = await request(app).get(`/api/activities/${id}`).set(auth(token));
    assert.equal(detail.body.ai_grade_enabled, 1);
    const [ana, beto] = ['Ana', 'Beto'].map((n) => detail.body.responses.find((r) => r.student_name === n));
    for (const r of [ana, beto]) {
      assert.equal(typeof r.ai_grade, 'number');
      assert.ok(r.ai_grade >= 0 && r.ai_grade <= 10);
      assert.ok(r.ai_grade_reason);
      assert.equal(r.teacher_grade, null, 'a IA nunca preenche a nota oficial');
      assert.doesNotMatch(r.ai_feedback_text, /\bnota\b/i, 'texto para o aluno não fala de nota');
    }

    // Aprovar sem lançar nota: o aluno não recebe a sugestão
    await request(app).post(`/api/feedback/${beto.feedback_id}/approve`).set(auth(token)).expect(200);
    const exp = await request(app).get(`/api/activities/${id}/export`).set(auth(token));
    const betoLine = exp.text.split('\n').find((l) => l.includes('"Beto"'));
    assert.match(betoLine, /,"","aprovado"$/, 'exportação só leva a nota do professor');
  });

  test('desligada por padrão; pode ligar depois e regenerar mantendo a nota lançada', async () => {
    const token = await registerTeacher('nota2@escola.dev');
    const created = await request(app).post('/api/activities').set(auth(token)).send(BASE);
    const id = created.body.id;
    await request(app).post(`/api/activities/${id}/manual`).set(auth(token)).send({ responses: [RESPONSES[0]] }).expect(201);
    await request(app).post(`/api/activities/${id}/generate`).set(auth(token)).expect(202);
    await waitJob(id);

    let r = (await request(app).get(`/api/activities/${id}`).set(auth(token))).body.responses[0];
    assert.equal(r.ai_grade, null);
    await request(app).patch(`/api/feedback/${r.feedback_id}`).set(auth(token)).send({ teacherGrade: 8 }).expect(200);

    await request(app).patch(`/api/activities/${id}/ai-grade`).set(auth(token)).send({ enabled: 'sim' }).expect(400);
    await request(app).patch(`/api/activities/${id}/ai-grade`).set(auth(token)).send({ enabled: true }).expect(200);
    await request(app).post(`/api/feedback/${r.feedback_id}/regenerate`).set(auth(token)).expect(200);

    r = (await request(app).get(`/api/activities/${id}`).set(auth(token))).body.responses[0];
    assert.equal(typeof r.ai_grade, 'number');
    assert.equal(r.teacher_grade, 8, 'a nota que o professor lançou continua valendo');

    // Outro professor não mexe na configuração
    const other = await registerTeacher('nota3@escola.dev');
    await request(app).patch(`/api/activities/${id}/ai-grade`).set(auth(other)).send({ enabled: false }).expect(404);
  });

  test('múltipla escolha nunca liga a nota sugerida', async () => {
    const token = await registerTeacher('nota4@escola.dev');
    const created = await request(app).post('/api/activities').set(auth(token)).send({
      ...BASE,
      questionType: 'objetiva',
      options: [{ texto: 'Cloroplasto' }, { texto: 'Núcleo' }],
      correctOption: 'A',
      aiGradeEnabled: true,
    });
    assert.equal(created.status, 201);
    const d = await request(app).get(`/api/activities/${created.body.id}`).set(auth(token));
    assert.equal(d.body.ai_grade_enabled, 0);
    await request(app).patch(`/api/activities/${created.body.id}/ai-grade`).set(auth(token)).send({ enabled: true }).expect(400);
  });

  test('prova com várias perguntas recebe uma sugestão pela média das questões', async () => {
    const token = await registerTeacher('nota5@escola.dev');
    const created = await request(app).post('/api/activities').set(auth(token)).send({
      ...BASE,
      aiGradeEnabled: true,
      extraQuestions: [{ question: 'Explique a respiração.', rubric: 'Glicose e oxigênio viram energia.' }],
    });
    const id = created.body.id;
    await request(app).post(`/api/activities/${id}/manual`).set(auth(token))
      .send({ responses: [{ student_name: 'Caio', answers: [RESPONSES[0].original_response, ''] }] }).expect(201);
    await request(app).post(`/api/activities/${id}/generate`).set(auth(token)).expect(202);
    await waitJob(id);
    const r = (await request(app).get(`/api/activities/${id}`).set(auth(token))).body.responses[0];
    const parsed = JSON.parse(r.ai_feedback_json);
    assert.equal(parsed.questoes[1].nota_sugerida, 0);
    assert.equal(r.ai_grade, Math.round((parsed.questoes[0].nota_sugerida / 2) * 2) / 2);
    assert.match(r.ai_grade_reason, /Média das questões/);
  });
});
