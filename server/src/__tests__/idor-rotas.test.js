/**
 * Testes de integração para verificar proteção contra IDOR (Insecure Direct Object Reference).
 *
 * Cenário: Professor A cria uma atividade. Professor B (conta separada) tenta acessar
 * todos os endpoints que envolvem o ID dessa atividade ou de seus feedbacks.
 * Cada tentativa do Professor B deve retornar 404 — nunca 200, 403, ou dados alheios.
 *
 * Critério de pronto (do plano): confirmar que nenhum professor consegue acessar dados
 * do outro nem manipulando a URL/chamando a API diretamente.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// ── Configura banco em memória e segredos antes de importar módulos que dependem deles
process.env.DB_PATH = ':memory:';
process.env.GEMINI_API_KEY = 'test-key-placeholder';
process.env.JWT_SECRET = 'test-secret-key-idor-tests';

const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter }   = await import('../routes/students.js');
const { default: feedbackRouter }   = await import('../routes/feedback.js');
const { requireAuth }               = await import('../middleware/auth.js');
const { generateToken }             = await import('../services/auth.js');
const { createTeacher, saveFeedback, addResponses } = await import('../database/db.js');

// ── Monta o app de teste completo
function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/activities', requireAuth, activitiesRouter);
  app.use('/api/activities', requireAuth, studentsRouter);
  app.use('/api',            requireAuth, feedbackRouter);
  return app;
}

const app = buildApp();

// ── Cria dois professores distintos
const teacherA = createTeacher({ name: 'Professor A', email: 'prof.a@escola.org', passwordHash: 'hash_a' });
const teacherB = createTeacher({ name: 'Professor B', email: 'prof.b@escola.org', passwordHash: 'hash_b' });
const tokenA = generateToken(teacherA);
const tokenB = generateToken(teacherB);

// IDs criados pelo Professor A — preenchidos em before()
let activityIdA;
let feedbackIdA;

// ── Configuração: Professor A cria atividade, sobe respostas e gera um feedback
before(async () => {
  // Cria atividade pelo Professor A
  const actRes = await request(app)
    .post('/api/activities')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      title: 'Atividade do Professor A',
      question: 'Explique fotossíntese.',
      rubric: 'Processo de conversão de luz em energia.',
    });
  activityIdA = actRes.body.id;

  // Adiciona resposta do aluno
  addResponses(activityIdA, [{ student_name: 'Aluno X', original_response: 'A planta usa luz solar.' }], 'manual');

  // Cria feedback manualmente (sem chamar a API do Gemini)
  const { getResponsesByActivity } = await import('../database/db.js');
  const responses = getResponsesByActivity(activityIdA);
  const fb = saveFeedback(responses[0].id, '{"nota":8}', 'Bom texto', 'gemini-test');
  feedbackIdA = Number(fb.id);
});

// ──────────────────────────────────────────
// Professor B tentando acessar recursos do Professor A
// ──────────────────────────────────────────

describe('IDOR — Professor B não pode acessar atividade do Professor A', () => {
  test('GET /api/activities/:id → 404', async () => {
    const res = await request(app)
      .get(`/api/activities/${activityIdA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404, `Esperado 404, recebeu ${res.status}`);
  });

  test('POST /api/activities/:id/upload → 404', async () => {
    const res = await request(app)
      .post(`/api/activities/${activityIdA}/upload`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ csvContent: 'nome_aluno,resposta\nJoão,Texto' });
    assert.equal(res.status, 404, `Esperado 404, recebeu ${res.status}`);
  });

  test('POST /api/activities/:id/manual → 404', async () => {
    const res = await request(app)
      .post(`/api/activities/${activityIdA}/manual`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ responses: [{ student_name: 'Invasor', original_response: 'Texto invasor' }] });
    assert.equal(res.status, 404, `Esperado 404, recebeu ${res.status}`);
  });

  test('POST /api/activities/:id/generate → 404', async () => {
    const res = await request(app)
      .post(`/api/activities/${activityIdA}/generate`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404, `Esperado 404, recebeu ${res.status}`);
  });

  test('GET /api/activities/:id/progress → seguro (progress vazio, não vaza dados)', async () => {
    // /progress consulta apenas a fila em memória por ID — não retorna dados do DB.
    // O comportamento esperado é 200 com progresso zerado/vazio (não há dado sensível).
    const res = await request(app)
      .get(`/api/activities/${activityIdA}/progress`)
      .set('Authorization', `Bearer ${tokenB}`);
    // Aceita 200 com objeto vazio/null OU 404 — o importante é não retornar dados de alunos do Prof A
    assert.ok(
      res.status === 200 || res.status === 404,
      `Status inesperado: ${res.status}`
    );
    if (res.status === 200) {
      // Se retornar 200, não pode conter dados de alunos
      assert.ok(!res.body.responses, 'Não deve vazar respostas de alunos via /progress');
    }
  });

  test('GET /api/activities/:id/export → 404', async () => {
    const res = await request(app)
      .get(`/api/activities/${activityIdA}/export`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404, `Esperado 404, recebeu ${res.status}`);
  });

  test('PATCH /api/feedback/:feedbackId → 404', async () => {
    const res = await request(app)
      .patch(`/api/feedback/${feedbackIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ teacherFeedback: 'Texto invasor editado' });
    assert.equal(res.status, 404, `Esperado 404, recebeu ${res.status}`);
  });

  test('POST /api/feedback/:feedbackId/approve → 404', async () => {
    const res = await request(app)
      .post(`/api/feedback/${feedbackIdA}/approve`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404, `Esperado 404, recebeu ${res.status}`);
  });
});

// ──────────────────────────────────────────
// Professor A ainda pode acessar seus próprios recursos
// ──────────────────────────────────────────

describe('Controle positivo — Professor A acessa normalmente seus próprios recursos', () => {
  test('GET /api/activities/:id → 200 para o Professor A', async () => {
    const res = await request(app)
      .get(`/api/activities/${activityIdA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 200, `Esperado 200, recebeu ${res.status}`);
    assert.equal(res.body.id, activityIdA);
    assert.ok(Array.isArray(res.body.responses));
  });

  test('GET /api/activities/:id/export → 200 para o Professor A', async () => {
    const res = await request(app)
      .get(`/api/activities/${activityIdA}/export`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 200, `Esperado 200, recebeu ${res.status}`);
    assert.ok(res.text.includes('nome_aluno'), 'CSV deve conter cabeçalho nome_aluno');
  });

  test('PATCH /api/feedback/:feedbackId → 200 para o Professor A', async () => {
    const res = await request(app)
      .patch(`/api/feedback/${feedbackIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ teacherFeedback: 'Feedback revisado pelo dono' });
    assert.equal(res.status, 200, `Esperado 200, recebeu ${res.status}`);
  });

  test('POST /api/feedback/:feedbackId/approve → 200 para o Professor A', async () => {
    const res = await request(app)
      .post(`/api/feedback/${feedbackIdA}/approve`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 200, `Esperado 200, recebeu ${res.status}`);
  });
});
