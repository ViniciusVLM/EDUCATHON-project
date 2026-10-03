/**
 * Testes de segurança e autorização (IDOR) - Fase 2
 * Simula dois professores para validar que nenhum consegue acessar, modificar
 * ou deletar recursos do outro, e que atividades sem dono não vazam.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key-idor';

const { default: classesRouter } = await import('../routes/classes.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { default: csvRouter } = await import('../routes/csv.js');
const { requireAuth } = await import('../middleware/auth.js');
const { generateToken } = await import('../services/auth.js');
const { createTeacher, getDb } = await import('../database/db.js');

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/classes', requireAuth, classesRouter);
  app.use('/api/activities', requireAuth, activitiesRouter);
  app.use('/api', requireAuth, feedbackRouter);
  app.use('/api', requireAuth, csvRouter);
  return app;
}

const app = buildApp();

// Professor 1 (Alice)
const teacherA = createTeacher({
  name: 'Professora Alice',
  email: 'alice@educathon.org',
  passwordHash: 'hash_alice',
});
const tokenA = generateToken(teacherA);

// Professor 2 (Bob)
const teacherB = createTeacher({
  name: 'Professor Bob',
  email: 'bob@educathon.org',
  passwordHash: 'hash_bob',
});
const tokenB = generateToken(teacherB);

describe('Fase 2 — Prevenção de IDOR e Falhas de Autorização', () => {

  describe('Item 1: DELETE /api/classes/:id/students/:studentId (Cross-class student deletion)', () => {
    test('impede que professor apague aluno de outra turma/professor', async () => {
      // 1. Alice cria Turma A e adiciona Aluno A
      const classARes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Turma Alice 1A' });
      const classAId = classARes.body.class.id;

      const studentARes = await request(app)
        .post(`/api/classes/${classAId}/students`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Aluno da Alice' });
      const studentAId = studentARes.body.student.id;

      // 2. Bob cria Turma B e adiciona Aluno B
      const classBRes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Turma Bob 2B' });
      const classBId = classBRes.body.class.id;

      const studentBRes = await request(app)
        .post(`/api/classes/${classBId}/students`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Aluno do Bob' });
      const studentBId = studentBRes.body.student.id;

      // 3. Bob tenta apagar o Aluno A informando a turma de Alice (não é dono da turma) -> 404
      const idorBobOnClassA = await request(app)
        .delete(`/api/classes/${classAId}/students/${studentAId}`)
        .set('Authorization', `Bearer ${tokenB}`);
      assert.equal(idorBobOnClassA.status, 404);

      // 4. Bob tenta apagar o Aluno A passando a sua própria turma (Aluno A não pertence à Turma B) -> 404
      const idorBobOnClassB = await request(app)
        .delete(`/api/classes/${classBId}/students/${studentAId}`)
        .set('Authorization', `Bearer ${tokenB}`);
      assert.equal(idorBobOnClassB.status, 404);
      assert.match(idorBobOnClassB.body.error, /Aluno não encontrado nesta turma/i);

      // 5. Verifica que o Aluno A continua intacto na Turma A
      const verifyClassA = await request(app)
        .get(`/api/classes/${classAId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const stillHasStudentA = verifyClassA.body.students.some((s) => s.id === studentAId);
      assert.equal(stillHasStudentA, true);

      // 6. Alice consegue apagar seu próprio aluno com sucesso
      const deleteSuccess = await request(app)
        .delete(`/api/classes/${classAId}/students/${studentAId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      assert.equal(deleteSuccess.status, 200);

      // 7. Bob consegue apagar o aluno dele com sucesso
      const deleteSuccessBob = await request(app)
        .delete(`/api/classes/${classBId}/students/${studentBId}`)
        .set('Authorization', `Bearer ${tokenB}`);
      assert.equal(deleteSuccessBob.status, 200);
    });
  });

  describe('Item 2: GET /api/activities/:id/progress (Progress endpoint ownership check)', () => {
    test('impede que professor acesse progresso de atividade de outro professor', async () => {
      // 1. Alice cria uma atividade
      const actRes = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Redação sobre Meio Ambiente',
          question: 'Discorra sobre a preservação.',
          rubric: 'Critérios claros.',
        });
      const activityId = actRes.body.id;

      // 2. Bob tenta acessar o progresso da atividade de Alice -> 404
      const bobAccess = await request(app)
        .get(`/api/activities/${activityId}/progress`)
        .set('Authorization', `Bearer ${tokenB}`);
      assert.equal(bobAccess.status, 404);
      assert.match(bobAccess.body.error, /Atividade não encontrada/i);

      // 3. Alice acessa o progresso de sua própria atividade -> 200
      const aliceAccess = await request(app)
        .get(`/api/activities/${activityId}/progress`)
        .set('Authorization', `Bearer ${tokenA}`);
      assert.equal(aliceAccess.status, 200);
      assert.equal(aliceAccess.body.status, 'idle');
      assert.equal(typeof aliceAccess.body.processed, 'number');
    });
  });

  describe('Item 3: POST /api/activities (Class ID ownership validation)', () => {
    test('impede vincular atividade a turma que pertence a outro professor', async () => {
      // 1. Alice cria uma turma
      const classRes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Biologia 1º Ano' });
      const aliceClassId = classRes.body.class.id;

      // 2. Bob tenta criar atividade vinculando à turma de Alice -> 404
      const bobCreateRes = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          title: 'Atividade Indevida',
          question: 'Pergunta?',
          rubric: 'Rubrica',
          classId: aliceClassId,
        });
      assert.equal(bobCreateRes.status, 404);
      assert.match(bobCreateRes.body.error, /Turma não encontrada/i);

      // 3. Alice cria atividade vinculando à sua própria turma -> 201
      const aliceCreateRes = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Atividade Legítima',
          question: 'Pergunta?',
          rubric: 'Rubrica',
          classId: aliceClassId,
        });
      assert.equal(aliceCreateRes.status, 201);
    });
  });

  describe('Item 4: GET /api/activities e getAllActivities (Data isolation & no unowned leak)', () => {
    test('retorna apenas atividades do professor logado, sem vazar de outros ou sem dono', async () => {
      // 1. Alice cria uma atividade exclusiva
      const actAlice = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Atividade da Alice - Isolamento',
          question: 'Q Alice',
          rubric: 'R Alice',
        });
      const aliceActId = actAlice.body.id;

      // 2. Bob cria uma atividade exclusiva
      const actBob = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          title: 'Atividade do Bob - Isolamento',
          question: 'Q Bob',
          rubric: 'R Bob',
        });
      const bobActId = actBob.body.id;

      // 3. Insere atividade sem dono (teacher_id = NULL) diretamente no DB
      const db = getDb();
      const insertUnowned = db.prepare(`
        INSERT INTO activities (title, question, rubric, teacher_id)
        VALUES ('Atividade Órfã Antiga', 'Q Órfã', 'R Órfã', NULL)
      `);
      const unownedResult = insertUnowned.run();
      const unownedId = Number(unownedResult.lastInsertRowid);

      // 4. Bob lista atividades: NÃO deve ver a da Alice nem a órfã
      const bobListRes = await request(app)
        .get('/api/activities')
        .set('Authorization', `Bearer ${tokenB}`);
      assert.equal(bobListRes.status, 200);
      const bobIds = bobListRes.body.map((a) => a.id);
      assert.ok(bobIds.includes(bobActId), 'Bob deve ver sua própria atividade');
      assert.ok(!bobIds.includes(aliceActId), 'Bob NÃO deve ver a atividade de Alice');
      assert.ok(!bobIds.includes(unownedId), 'Bob NÃO deve ver atividade com teacher_id NULL');

      // 5. Alice lista atividades: NÃO deve ver a do Bob nem a órfã
      const aliceListRes = await request(app)
        .get('/api/activities')
        .set('Authorization', `Bearer ${tokenA}`);
      assert.equal(aliceListRes.status, 200);
      const aliceIds = aliceListRes.body.map((a) => a.id);
      assert.ok(aliceIds.includes(aliceActId), 'Alice deve ver sua própria atividade');
      assert.ok(!aliceIds.includes(bobActId), 'Alice NÃO deve ver a atividade de Bob');
      assert.ok(!aliceIds.includes(unownedId), 'Alice NÃO deve ver atividade com teacher_id NULL');
    });
  });

  describe('Item 5: POST /api/csv/preview (Authentication requirement check)', () => {
    test('exige autenticação para prévia e funciona com usuário autenticado', async () => {
      const csvContent = 'Nome,Resposta\nJoão,Minha resposta dissertativa aqui';

      // Sem autenticação -> 401
      const unauthRes = await request(app)
        .post('/api/csv/preview')
        .send({ csvContent });
      assert.equal(unauthRes.status, 401);

      // Com autenticação -> 200 com resultado
      const authRes = await request(app)
        .post('/api/csv/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ csvContent });
      assert.equal(authRes.status, 200);
      assert.equal(authRes.body.total, 1);
      assert.equal(authRes.body.rows[0].student_name, 'João');
    });
  });

});
