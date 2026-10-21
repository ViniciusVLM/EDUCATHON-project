/**
 * Atividades com várias questões dissertativas: criação, respostas por questão (manual e CSV),
 * feedback da IA por questão, regeneração e portal do aluno.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-varias-questoes-32-caracteres!!!!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';
process.env.FREE_MONTHLY_QUOTA = '50';

const { default: authRouter } = await import('../routes/auth.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { default: csvRouter } = await import('../routes/csv.js');
const { requireAuth } = await import('../middleware/auth.js');
const { getProgress } = await import('../services/queue.js');
const { getDb } = await import('../database/db.js');
const {
  splitResponse,
  composeResponse,
  getAnswers,
  validateExtraQuestions,
  combineFeedbacks,
  MAX_QUESTIONS,
} = await import('../services/multiQuestion.js');
const { parseCSV } = await import('../services/parser.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, csvRouter);
app.use('/api', requireAuth, feedbackRouter);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function registerTeacher(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Prof Teste', email, password: 'SenhaForte@2026' });
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
  title: 'Prova de Ecologia',
  question: 'O que é uma cadeia alimentar?',
  rubric: 'Sequência de quem come quem, com exemplo de três níveis.',
  educationLevel: 'medio',
  subject: 'Biologia',
};
const EXTRA = [
  { question: 'Qual o papel dos decompositores?', rubric: 'Reciclam nutrientes da matéria morta.' },
  { question: 'Por que a energia diminui entre níveis?', rubric: 'Perda como calor; ~10% passa adiante.' },
];

describe('serviço de várias questões', () => {
  test('separa resposta única pelos marcadores "Questão N:"', () => {
    const text = 'Questão 1: primeira\nlinha dois\n\nQuestao 2 - segunda\nQ3) terceira';
    assert.deepEqual(splitResponse(text, 3), ['primeira\nlinha dois', 'segunda', 'terceira']);
    assert.equal(splitResponse('sem marcador nenhum', 3), null);
  });

  test('compor e separar de novo devolve as mesmas respostas (inclusive em branco)', () => {
    const answers = ['a resposta 1', '', 'resposta 3'];
    assert.deepEqual(getAnswers({ original_response: composeResponse(answers) }, 3), answers);
    assert.deepEqual(getAnswers({ answers: JSON.stringify(answers) }, 3), answers);
  });

  test('valida perguntas extras e o limite', () => {
    assert.ok(validateExtraQuestions([{ question: 'x', rubric: '' }], BASE).error);
    const many = Array.from({ length: MAX_QUESTIONS }, () => ({ question: 'p', rubric: 'r' }));
    assert.ok(validateExtraQuestions(many, BASE).error);
    assert.equal(validateExtraQuestions(EXTRA, BASE).questions.length, 3);
    assert.equal(validateExtraQuestions([], BASE).questions, null);
  });

  test('junta feedbacks com prefixo por questão nos critérios', () => {
    const combined = combineFeedbacks([
      { pontos_fortes: 'a', lacunas: 'b', sugestao_melhoria: 'c', feedback_completo: 'F1', criterios_avaliacao: [{ criterio: 'X', atendido: true, evidencia: '' }] },
      { pontos_fortes: 'd', lacunas: 'e', sugestao_melhoria: 'f', feedback_completo: 'F2' },
    ]);
    assert.match(combined.feedback_completo, /Questão 1\nF1\n\nQuestão 2\nF2/);
    assert.equal(combined.criterios_avaliacao[0].criterio, 'Q1 · X');
    assert.equal(combined.questoes.length, 2);
  });

  test('CSV com uma coluna por questão', () => {
    const rows = parseCSV('nome_aluno;resposta_1;resposta_2;resposta_3\nAna;r1;;r3\nBeto;;;\n', { questionCount: 3 });
    assert.equal(rows.length, 1, 'aluno sem nenhuma resposta é ignorado');
    assert.deepEqual(rows[0].answers, ['r1', '', 'r3']);
    assert.match(rows[0].original_response, /Questão 2: \(sem resposta\)/);
  });

  test('arquivo de várias perguntas numa atividade de uma pergunta explica o engano', () => {
    assert.throws(
      () => parseCSV('nome_aluno,resposta_1,resposta_2\nAna,a,b\n'),
      /tem só 1 pergunta.*atividade certa/
    );
    assert.equal(parseCSV('nome_aluno,resposta_1\nAna,a\n')[0].original_response, 'a');
  });

  test('CSV sem colunas de resposta numeradas nem "resposta" explica o formato', () => {
    assert.throws(() => parseCSV('nome_aluno,outra\nAna,x\n', { questionCount: 2 }), /resposta_1, resposta_2/);
  });
});

describe('fluxo completo de uma prova com várias perguntas', () => {
  test('cria, recebe respostas, gera feedback por questão e regenera', async () => {
    const token = await registerTeacher('multi@escola.dev');

    const bad = await request(app).post('/api/activities').set(auth(token))
      .send({ ...BASE, extraQuestions: [{ question: 'sem rubrica', rubric: '' }] });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /pergunta 2/);

    const created = await request(app).post('/api/activities').set(auth(token)).send({ ...BASE, extraQuestions: EXTRA });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.id;

    const detail = await request(app).get(`/api/activities/${id}`).set(auth(token));
    assert.equal(JSON.parse(detail.body.questions).length, 3);
    assert.equal(detail.body.question, BASE.question, 'a pergunta 1 continua em question');

    // Manual: precisa de answers
    const noAnswers = await request(app).post(`/api/activities/${id}/manual`).set(auth(token))
      .send({ responses: [{ student_name: 'Ana', original_response: 'texto solto' }] });
    assert.equal(noAnswers.status, 400);

    const tooMany = await request(app).post(`/api/activities/${id}/manual`).set(auth(token))
      .send({ responses: [{ student_name: 'Ana', answers: ['a', 'b', 'c', 'd'] }] });
    assert.equal(tooMany.status, 400);

    const manual = await request(app).post(`/api/activities/${id}/manual`).set(auth(token)).send({
      responses: [
        { student_name: 'Ana', answers: ['Capim → gafanhoto → sapo, cada um come o anterior.', 'Fungos reciclam nutrientes.', 'Perde calor.'] },
        { student_name: 'Beto', answers: ['Leão come zebra.', '', ''] },
      ],
    });
    assert.equal(manual.status, 201, JSON.stringify(manual.body));

    // CSV com colunas numeradas
    const csv = 'nome_aluno,resposta_1,resposta_2,resposta_3\nCaio,"Plantas → coelho → raposa","Decompõem","10% passa"\n';
    const preview = await request(app).post('/api/csv/preview').set(auth(token)).send({ csvContent: csv, questionCount: 3 });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.deepEqual(preview.body.rows[0].answers, ['Plantas → coelho → raposa', 'Decompõem', '10% passa']);
    const up = await request(app).post(`/api/activities/${id}/upload`).set(auth(token)).send({ csvContent: csv });
    assert.equal(up.status, 201, JSON.stringify(up.body));

    const quotaBefore = getDb().prepare("SELECT COALESCE(SUM(units),0) AS u FROM ai_usage").get().u;
    const gen = await request(app).post(`/api/activities/${id}/generate`).set(auth(token));
    assert.equal(gen.status, 202, JSON.stringify(gen.body));
    const progress = await waitJob(id);
    assert.equal(progress.status, 'complete');
    assert.equal(progress.errors, 0);
    const quotaAfter = getDb().prepare("SELECT COALESCE(SUM(units),0) AS u FROM ai_usage").get().u;
    assert.equal(quotaAfter - quotaBefore, 3, 'uma correção por aluno, não por questão');

    const after = await request(app).get(`/api/activities/${id}`).set(auth(token));
    const beto = after.body.responses.find((r) => r.student_name === 'Beto');
    const parsed = JSON.parse(beto.ai_feedback_json);
    assert.equal(parsed.questoes.length, 3);
    assert.equal(parsed.questoes[1].sem_resposta, true, 'questão em branco não chama a IA');
    assert.match(beto.ai_feedback_text, /^Questão 1\n/);
    assert.match(beto.ai_feedback_text, /Questão 3\n/);
    assert.deepEqual(JSON.parse(beto.answers), ['Leão come zebra.', '', '']);

    // Regenerar mantém o formato por questão
    const regen = await request(app).post(`/api/feedback/${beto.feedback_id}/regenerate`).set(auth(token));
    assert.equal(regen.status, 200, JSON.stringify(regen.body));
    assert.equal(regen.body.feedback.questoes.length, 3);

    // Feedback longo (várias questões) ainda pode ser editado
    const longText = 'x'.repeat(15000);
    const edit = await request(app).patch(`/api/feedback/${regen.body.feedbackId}`).set(auth(token))
      .send({ teacherFeedback: longText, teacherGrade: 7.5 });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
  });

  test('atividade de uma pergunta só não guarda lista e aceita resposta em texto', async () => {
    const token = await registerTeacher('single@escola.dev');
    const single = await request(app).post('/api/activities').set(auth(token)).send({ ...BASE, extraQuestions: [] });
    assert.equal(single.status, 201);
    const d = await request(app).get(`/api/activities/${single.body.id}`).set(auth(token));
    assert.equal(d.body.questions, null);
    const manual = await request(app).post(`/api/activities/${single.body.id}/manual`).set(auth(token))
      .send({ responses: [{ student_name: 'Ana', original_response: 'Resposta única' }] });
    assert.equal(manual.status, 201);
  });
});
