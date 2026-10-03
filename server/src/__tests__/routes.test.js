/**
 * Testes de integração das rotas principais da API.
 * Usa supertest + banco SQLite em memória (:memory:) para isolamento.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// ── Configura banco em memória antes de importar os módulos que dependem dele
process.env.DB_PATH = ':memory:';
process.env.GEMINI_API_KEY = 'test-key-placeholder';
process.env.JWT_SECRET = 'test-secret-key-routes-tests';

// Importa routers e helpers do DB
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: csvRouter } = await import('../routes/csv.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { requireAuth } = await import('../middleware/auth.js');
const { generateToken } = await import('../services/auth.js');
const { createTeacher } = await import('../database/db.js');

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
  app.use('/api/activities', requireAuth, activitiesRouter);
  app.use('/api/activities', requireAuth, studentsRouter);
  app.use('/api', requireAuth, csvRouter);
  return app;
}

const app = buildApp();
const teacher = createTeacher({
  name: 'Prof. Teste',
  email: 'prof.teste@escola.org',
  passwordHash: 'dummy_hash',
});
const testToken = generateToken(teacher);

// ──────────────────────────────────────────
// Health
// ──────────────────────────────────────────
describe('GET /api/health', () => {
  test('retorna status ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });
});

// ──────────────────────────────────────────
// Activities
// ──────────────────────────────────────────
describe('POST /api/activities', () => {
  test('rejeita criação de atividade sem autenticação (401)', async () => {
    const res = await request(app).post('/api/activities').send({
      title: 'Sem Auth',
      question: 'Pergunta?',
      rubric: 'Rubrica',
    });
    assert.equal(res.status, 401);
  });

  test('cria atividade com dados válidos e campos da Fase 4', async () => {
    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        title: 'Teste de Redação',
        question: 'Qual o impacto da IA na educação?',
        rubric: 'Esperamos uma análise crítica com exemplos concretos.',
        educationLevel: 'medio',
        subject: 'Língua Portuguesa',
        rubricCriteria: [{ criterio: 'Gramática', peso: 2 }],
      });
    assert.equal(res.status, 201);
    assert.ok(res.body.id > 0);
    assert.match(res.body.message, /sucesso/i);
  });

  test('retorna 400 quando falta campo obrigatório', async () => {
    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        title: 'Sem pergunta',
      });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

describe('GET /api/activities', () => {
  test('retorna array de atividades', async () => {
    const res = await request(app)
      .get('/api/activities')
      .set('Authorization', `Bearer ${testToken}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('GET /api/activities/:id', () => {
  test('retorna 404 para atividade inexistente', async () => {
    const res = await request(app)
      .get('/api/activities/99999')
      .set('Authorization', `Bearer ${testToken}`);
    assert.equal(res.status, 404);
  });

  test('retorna atividade + respostas + stats para ID válido', async () => {
    // Cria primeiro
    const created = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        title: 'Atividade para GET',
        question: 'Pergunta?',
        rubric: 'Rubrica.',
      });
    const id = created.body.id;

    const res = await request(app)
      .get(`/api/activities/${id}`)
      .set('Authorization', `Bearer ${testToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, id);
    assert.ok(Array.isArray(res.body.responses));
    assert.ok(res.body.stats);
  });
});

// ──────────────────────────────────────────
// CSV Preview
// ──────────────────────────────────────────
describe('POST /api/csv/preview', () => {
  test('parseia CSV válido e retorna rows', async () => {
    const res = await request(app)
      .post('/api/csv/preview')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        csvContent: 'nome_aluno,resposta\nJoão,Minha resposta\nMaria,Outra resposta',
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.rows[0].student_name, 'João');
  });

  test('retorna 422 para CSV com colunas inválidas', async () => {
    const res = await request(app)
      .post('/api/csv/preview')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        csvContent: 'coluna_errada,outra_coluna\nJoão,Teste',
      });
    assert.equal(res.status, 422);
    assert.ok(res.body.error);
  });

  test('retorna 400 quando csvContent está ausente', async () => {
    const res = await request(app)
      .post('/api/csv/preview')
      .set('Authorization', `Bearer ${testToken}`)
      .send({});
    assert.equal(res.status, 400);
  });
});

// ──────────────────────────────────────────
// Student Responses (Fase 4)
// ──────────────────────────────────────────
describe('POST /api/activities/:id/manual (Fase 4)', () => {
  test('salva respostas com submission_method manual e calcula word_count', async () => {
    const actRes = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        title: 'Atividade Responses',
        question: 'Explique algo',
        rubric: 'Rubrica',
      });
    const actId = actRes.body.id;

    const res = await request(app)
      .post(`/api/activities/${actId}/manual`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        responses: [
          { student_name: 'Carlos', original_response: 'Uma resposta de teste com seis palavras.' },
        ],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.count, 1);

    const getRes = await request(app)
      .get(`/api/activities/${actId}`)
      .set('Authorization', `Bearer ${testToken}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.responses.length, 1);
    assert.equal(getRes.body.responses[0].submission_method, 'manual');
    assert.equal(getRes.body.responses[0].word_count, 7);
  });
});
