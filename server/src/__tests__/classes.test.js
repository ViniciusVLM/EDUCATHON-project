/**
 * Testes de integração para gestão de Turmas, Alunos e Casamento Automático (Fase 5.2).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key-classes';

const { default: classesRouter } = await import('../routes/classes.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { requireAuth } = await import('../middleware/auth.js');
const { generateToken } = await import('../services/auth.js');
const { createTeacher } = await import('../database/db.js');

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/classes', requireAuth, classesRouter);
  app.use('/api/activities', requireAuth, activitiesRouter);
  app.use('/api/activities', requireAuth, studentsRouter);
  return app;
}

const app = buildApp();

const teacher1 = createTeacher({
  name: 'Professor Silva',
  email: 'silva@educathon.org',
  passwordHash: 'hash_silva',
});
const token1 = generateToken(teacher1);

const teacher2 = createTeacher({
  name: 'Professora Santos',
  email: 'santos@educathon.org',
  passwordHash: 'hash_santos',
});
const token2 = generateToken(teacher2);

describe('CRUD de Turmas (/api/classes)', () => {
  let createdClassId;

  test('cria turma para o professor autenticado', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: '3º Ano A',
        schoolYear: '2026',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.class.name, '3º Ano A');
    assert.equal(res.body.class.school_year, '2026');
    assert.ok(res.body.class.id > 0);
    createdClassId = res.body.class.id;
  });

  test('rejeita criação de turma sem nome (400)', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: '   ' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /obrigatório/i);
  });

  test('lista turmas do professor e isola de outros professores', async () => {
    // Professor 1 lista
    const res1 = await request(app)
      .get('/api/classes')
      .set('Authorization', `Bearer ${token1}`);

    assert.equal(res1.status, 200);
    assert.equal(res1.body.length, 1);
    assert.equal(res1.body[0].name, '3º Ano A');

    // Professor 2 lista -> deve estar vazia
    const res2 = await request(app)
      .get('/api/classes')
      .set('Authorization', `Bearer ${token2}`);

    assert.equal(res2.status, 200);
    assert.equal(res2.body.length, 0);
  });

  test('retorna detalhes da turma com lista de alunos', async () => {
    const res = await request(app)
      .get(`/api/classes/${createdClassId}`)
      .set('Authorization', `Bearer ${token1}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.id, createdClassId);
    assert.ok(Array.isArray(res.body.students));
    assert.equal(res.body.students.length, 0);
  });

  test('impede outro professor de acessar turma alheia (404)', async () => {
    const res = await request(app)
      .get(`/api/classes/${createdClassId}`)
      .set('Authorization', `Bearer ${token2}`);

    assert.equal(res.status, 404);
  });

  test('atualiza dados da turma', async () => {
    const res = await request(app)
      .patch(`/api/classes/${createdClassId}`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: '3º Ano A - Matutino' });

    assert.equal(res.status, 200);

    const getRes = await request(app)
      .get(`/api/classes/${createdClassId}`)
      .set('Authorization', `Bearer ${token1}`);

    assert.equal(getRes.body.name, '3º Ano A - Matutino');
  });
});

describe('CRUD de Alunos na Turma (/api/classes/:id/students)', () => {
  let classId;
  let singleStudentId;

  test('prepara turma de teste', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'Turma de Alunos' });
    classId = res.body.class.id;
  });

  test('adiciona aluno individualmente à turma', async () => {
    const res = await request(app)
      .post(`/api/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Lucas Lima',
        email: 'lucas@escola.org',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.student.name, 'Lucas Lima');
    assert.equal(res.body.student.email, 'lucas@escola.org');
    singleStudentId = res.body.student.id;
  });

  test('adiciona múltiplos alunos em lote à turma', async () => {
    const res = await request(app)
      .post(`/api/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        students: [
          { name: 'Beatriz Costa', email: 'beatriz@escola.org' },
          { name: 'Gabriel Souza' },
        ],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.count, 2);

    const getRes = await request(app)
      .get(`/api/classes/${classId}`)
      .set('Authorization', `Bearer ${token1}`);

    assert.equal(getRes.body.students.length, 3);
  });

  test('remove aluno da turma', async () => {
    const delRes = await request(app)
      .delete(`/api/classes/${classId}/students/${singleStudentId}`)
      .set('Authorization', `Bearer ${token1}`);

    assert.equal(delRes.status, 200);

    const getRes = await request(app)
      .get(`/api/classes/${classId}`)
      .set('Authorization', `Bearer ${token1}`);

    assert.equal(getRes.body.students.length, 2);
  });
});

describe('Casamento Automático de Alunos no Upload de Respostas', () => {
  let classId;
  let actId;
  let registeredStudentId;

  test('cadastra turma, aluno e atividade vinculada', async () => {
    // 1. Cria turma
    const clsRes = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'Turma de Matching' });
    classId = clsRes.body.class.id;

    // 2. Cadastra aluno com acento e email
    const stuRes = await request(app)
      .post(`/api/classes/${classId}/students`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'João Pedro de Alcântara',
        email: 'joao.pedro@escola.org',
      });
    registeredStudentId = stuRes.body.student.id;

    // 3. Cria atividade com classId
    const actRes = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        title: 'Atividade com Turma Vinculada',
        question: 'O que é a fotossíntese?',
        rubric: 'Rubrica clara',
        classId: classId,
      });
    actId = actRes.body.id;
  });

  test('casa resposta pelo nome normalizado e preenche student_id e email automaticamente', async () => {
    // Aluno envia nome sem acento e sem email na submissão
    const uploadRes = await request(app)
      .post(`/api/activities/${actId}/manual`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        responses: [
          {
            student_name: 'joao pedro de alcantara', // minúsculo e sem acento
            original_response: 'A fotossintese e o processo pelo qual as plantas produzem energia.',
          },
          {
            student_name: 'Aluno Desconhecido',
            original_response: 'Outra resposta qualquer.',
          },
        ],
      });

    assert.equal(uploadRes.status, 201);

    const actDetail = await request(app)
      .get(`/api/activities/${actId}`)
      .set('Authorization', `Bearer ${token1}`);

    const responses = actDetail.body.responses;
    assert.equal(responses.length, 2);

    // O aluno cadastrado foi casado!
    const matched = responses.find((r) => r.student_name === 'joao pedro de alcantara');
    assert.ok(matched);
    assert.equal(matched.student_id, registeredStudentId);
    assert.equal(matched.email, 'joao.pedro@escola.org'); // aproveitou o e-mail cadastrado na turma!

    // O aluno não cadastrado ficou com student_id null
    const unmatched = responses.find((r) => r.student_name === 'Aluno Desconhecido');
    assert.ok(unmatched);
    assert.equal(unmatched.student_id, null);
  });
});
