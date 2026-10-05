/**
 * Testes do endpoint GET /api/dashboard/summary.
 * Verifica:
 * 1. Resumo agregado de métricas (atividades, alunos, feedbacks, erros, prazos, fila).
 * 2. Isolamento estrito entre professores (IDOR): Professor A não vê dados de Professor B.
 * 3. Estado vazio para novo professor sem atividades.
 * 4. Proteção de autenticação (401 se sem token).
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.DB_PATH = ':memory:';
process.env.GEMINI_API_KEY = 'test-key-placeholder';
process.env.JWT_SECRET = 'test-secret-key-dashboard';

const { default: dashboardRouter } = await import('../routes/dashboard.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { requireAuth } = await import('../middleware/auth.js');
const { generateToken } = await import('../services/auth.js');
const {
  createTeacher,
  createClass,
  createActivity,
  addResponses,
  saveFeedback,
  approveFeedback,
} = await import('../database/db.js');

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/dashboard', requireAuth, dashboardRouter);
  app.use('/api/activities', requireAuth, activitiesRouter);
  return app;
}

const app = buildApp();

let teacherA, teacherB, teacherEmpty;
let tokenA, tokenB, tokenEmpty;
let activityIdA1, activityIdA2, activityIdB;

before(() => {
  teacherA = createTeacher({ name: 'Profa. Ana', email: 'ana@escola.org', passwordHash: 'hash_ana' });
  teacherB = createTeacher({ name: 'Prof. Beto', email: 'beto@escola.org', passwordHash: 'hash_beto' });
  teacherEmpty = createTeacher({ name: 'Profa. Clara', email: 'clara@escola.org', passwordHash: 'hash_clara' });

  tokenA = generateToken(teacherA);
  tokenB = generateToken(teacherB);
  tokenEmpty = generateToken(teacherEmpty);

  // Professor A: Turma 1 e duas atividades
  const classA = createClass({ teacherId: teacherA.id, name: '3º Ano A', schoolYear: '2026' });

  const actA1 = createActivity({
    title: 'Redação Dissertativa',
    question: 'Escreva sobre sustentabilidade',
    rubric: 'Critérios de coerência e coesão',
    educationLevel: 'medio',
    subject: 'Língua Portuguesa',
    classId: classA.id,
    dueDate: '2026-10-15T23:59:00',
    teacherId: teacherA.id,
  });
  activityIdA1 = actA1.id;

  const actA2 = createActivity({
    title: 'Interpretação de Texto',
    question: 'Analise o poema',
    rubric: 'Compreensão de figuras de linguagem',
    educationLevel: 'medio',
    subject: 'Literatura',
    teacherId: teacherA.id,
  });
  activityIdA2 = actA2.id;

  // Adiciona respostas na atividade A1
  const [respA1Id, respA2Id] = addResponses(activityIdA1, [
    { student_name: 'Lucas Silva', original_response: 'Texto do Lucas sobre reciclagem' },
    { student_name: 'Mariana Costa', original_response: 'Texto da Mariana sobre energia solar' },
  ]);

  // Salva feedback e aprova um deles
  const fb1 = saveFeedback(respA1Id, '{"pontos_fortes":"bom"}', 'Bom trabalho Lucas');
  approveFeedback(fb1.id);

  // Salva feedback pendente para o segundo
  saveFeedback(respA2Id, '{"pontos_fortes":"legal"}', 'Bom trabalho Mariana');

  // Professor B: Uma atividade com uma resposta e feedback pendente
  const actB = createActivity({
    title: 'História do Brasil',
    question: 'Fale sobre a independência',
    rubric: 'Fatos históricos',
    educationLevel: 'fundamental',
    subject: 'História',
    dueDate: '2026-10-20T23:59:00',
    teacherId: teacherB.id,
  });
  activityIdB = actB.id;

  const [respBId] = addResponses(actB.id, [
    { student_name: 'Pedro Alves', original_response: 'Texto do Pedro' },
  ]);
  saveFeedback(respBId, '{"pontos_fortes":"correto"}', 'Muito bem Pedro');
});

describe('GET /api/dashboard/summary', () => {
  test('retorna 401 para requisições sem token', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    assert.strictEqual(res.status, 401);
  });

  test('retorna dados agregados corretos para o Professor A', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tokenA}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.teacher.id, teacherA.id);
    assert.strictEqual(res.body.teacher.name, 'Profa. Ana');

    // Métricas do Professor A: 2 atividades, 2 alunos respondentes, 2 feedbacks (1 aprovado, 1 pendente)
    const { metrics } = res.body;
    assert.strictEqual(metrics.total_activities, 2);
    assert.strictEqual(metrics.total_students, 2);
    assert.strictEqual(metrics.total_feedbacks, 2);
    assert.strictEqual(metrics.approved, 1);
    assert.strictEqual(metrics.pending_review, 1);

    // Atividades recentes incluem a turma '3º Ano A'
    assert.ok(Array.isArray(res.body.recent_activities));
    assert.strictEqual(res.body.recent_activities.length, 2);
    const actWithClass = res.body.recent_activities.find((a) => a.id === activityIdA1);
    assert.ok(actWithClass);
    assert.strictEqual(actWithClass.class_name, '3º Ano A');
    assert.strictEqual(actWithClass.subject, 'Língua Portuguesa');

    // Prazos lista apenas atividade com due_date
    assert.ok(Array.isArray(res.body.deadlines));
    assert.strictEqual(res.body.deadlines.length, 1);
    assert.strictEqual(res.body.deadlines[0].activity_id, activityIdA1);

    // Fila de revisão
    assert.ok(Array.isArray(res.body.review_queue));
    assert.strictEqual(res.body.review_queue.length, 1);
    assert.strictEqual(res.body.review_queue[0].activity_id, activityIdA1);
    assert.strictEqual(res.body.review_queue[0].total, 2);
    assert.strictEqual(res.body.review_queue[0].approved, 1);
    assert.strictEqual(res.body.review_queue[0].pending, 1);
    assert.strictEqual(res.body.review_queue[0].progress_percent, 50);
  });

  test('isolamento IDOR: Professor A NÃO vê dados do Professor B', async () => {
    const resA = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tokenA}`);

    // Não deve conter a atividade B
    const foundBInA = resA.body.recent_activities.some((a) => a.id === activityIdB);
    assert.strictEqual(foundBInA, false, 'Atividade do Professor B vazou para o Professor A');

    const foundDeadlinesB = resA.body.deadlines.some((d) => d.activity_id === activityIdB);
    assert.strictEqual(foundDeadlinesB, false, 'Prazo do Professor B vazou para o Professor A');

    // Agora consulta como Professor B
    const resB = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tokenB}`);

    assert.strictEqual(resB.status, 200);
    assert.strictEqual(resB.body.teacher.id, teacherB.id);
    assert.strictEqual(resB.body.metrics.total_activities, 1);
    assert.strictEqual(resB.body.metrics.total_students, 1);
    assert.strictEqual(resB.body.metrics.approved, 0);
    assert.strictEqual(resB.body.metrics.pending_review, 1);

    const foundAInB = resB.body.recent_activities.some((a) => a.id === activityIdA1 || a.id === activityIdA2);
    assert.strictEqual(foundAInB, false, 'Atividades do Professor A vazaram para o Professor B');
  });

  test('estado vazio: novo professor tem métricas zeradas e arrays vazios', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tokenEmpty}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.teacher.name, 'Profa. Clara');
    assert.strictEqual(res.body.metrics.total_activities, 0);
    assert.strictEqual(res.body.metrics.total_students, 0);
    assert.strictEqual(res.body.metrics.total_feedbacks, 0);
    assert.strictEqual(res.body.metrics.pending_review, 0);
    assert.strictEqual(res.body.metrics.approved, 0);
    assert.deepStrictEqual(res.body.recent_activities, []);
    assert.deepStrictEqual(res.body.deadlines, []);
    assert.deepStrictEqual(res.body.review_queue, []);
    assert.deepStrictEqual(res.body.pending_review_items, []);
  });
});
