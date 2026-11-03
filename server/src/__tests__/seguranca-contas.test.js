/**
 * Correções de segurança encontradas na revisão de 03/11/2026:
 * - acesso criado por uma instituição não "confirma" o e-mail em turmas de outra escola;
 * - a instituição não redefine a senha de contas que entram com Google;
 * - critérios inválidos não são aceitos (antes derrubavam o portal do aluno);
 * - entradas com tipo errado dão 400, não 500.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-seguranca-contas-32-caracteres!!!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';
process.env.FREE_MONTHLY_QUOTA = '100';

const { default: authRouter } = await import('../routes/auth.js');
const { default: classesRouter } = await import('../routes/classes.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { default: orgRouter } = await import('../routes/org.js');
const { default: studentAuthRouter } = await import('../routes/studentAuth.js');
const { default: studentRouter } = await import('../routes/student.js');
const { requireAuth, requireStudent } = await import('../middleware/auth.js');
const { getProgress } = await import('../services/queue.js');
const { getDb } = await import('../database/db.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/student-auth', studentAuthRouter);
app.use('/api/student', requireStudent, studentRouter);
app.use('/api/org', requireAuth, orgRouter);
app.use('/api/classes', requireAuth, classesRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, feedbackRouter);

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function register(name, email) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'SenhaForte@2026' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.token, id: res.body.teacher.id };
}

async function waitJob(id) {
  for (let i = 0; i < 600; i++) {
    const p = getProgress(id);
    if (p.status === 'complete' || p.status === 'error') return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job não terminou');
}

/** Professor de verdade com a aluna "vítima" na turma, resposta corrigida, nota e feedback aprovados. */
async function realTeacherWithGradedStudent(email, studentEmail) {
  const prof = await register('Prof Real', email);
  const cls = await request(app).post('/api/classes').set(auth(prof.token)).send({ name: '9º A' });
  const classId = cls.body.class.id;
  await request(app).post(`/api/classes/${classId}/students`).set(auth(prof.token))
    .send({ name: 'Vitória', email: studentEmail }).expect(201);
  const code = await request(app).post(`/api/classes/${classId}/join-code`).set(auth(prof.token));
  const act = await request(app).post('/api/activities').set(auth(prof.token)).send({
    title: 'Ciclo da água', question: 'Explique.', rubric: 'Evaporação e chuva.', classId,
  });
  await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(prof.token)).send({
    responses: [{ student_name: 'Vitória', email: studentEmail, original_response: 'Resposta privada da vítima sobre a água que evapora.' }],
  }).expect(201);
  await request(app).post(`/api/activities/${act.body.id}/generate`).set(auth(prof.token)).expect(202);
  await waitJob(act.body.id);
  const detail = await request(app).get(`/api/activities/${act.body.id}`).set(auth(prof.token));
  const fb = detail.body.responses[0].feedback_id;
  await request(app).patch(`/api/feedback/${fb}`).set(auth(prof.token)).send({ teacherGrade: 3.5 }).expect(200);
  await request(app).post(`/api/feedback/${fb}/approve`).set(auth(prof.token)).expect(200);
  return { prof, classId, classCode: code.body.joinCode, activityId: act.body.id, feedbackId: fb };
}

describe('acesso de aluno criado por uma instituição', () => {
  test('não puxa respostas e notas de turmas de OUTRA instituição', async () => {
    const real = await realTeacherWithGradedStudent('real1@escola.dev', 'vitima@aluno.org');

    // Atacante: cria a própria instituição e um acesso com o e-mail da vítima
    const atk = await register('Atacante', 'atk1@escola.dev');
    await request(app).post('/api/org').set(auth(atk.token)).send({ name: 'Escola Falsa' }).expect(201);
    const atkClass = await request(app).post('/api/classes').set(auth(atk.token)).send({ name: 'Turma falsa' });
    const created = await request(app).post('/api/org/students').set(auth(atk.token))
      .send({ name: 'Vitória', email: 'vitima@aluno.org', classId: atkClass.body.class.id });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const login = await request(app).post('/api/student-auth/login')
      .send({ email: 'vitima@aluno.org', password: created.body.tempPassword });
    assert.equal(login.status, 200);
    const st = login.body.token;
    await request(app).post('/api/student/join').set(auth(st)).send({ classCode: real.classCode }).expect(201);

    const acts = await request(app).get('/api/student/activities').set(auth(st));
    assert.equal(acts.status, 200);
    const leaked = acts.body.activities.find((a) => a.id === real.activityId);
    assert.ok(leaked, 'a atividade da turma aparece (o aluno entrou com o código)');
    assert.equal(leaked.myAnswer, null, 'a resposta da vítima não pode aparecer');
    assert.equal(leaked.grade, null, 'a nota da vítima não pode aparecer');
    assert.equal(leaked.feedback, null);
  });

  test('nas turmas da própria instituição, o acesso continua ligado à lista da turma', async () => {
    const admin = await register('Admin', 'admin2@escola.dev');
    await request(app).post('/api/org').set(auth(admin.token)).send({ name: 'Escola Boa' }).expect(201);
    const cls = await request(app).post('/api/classes').set(auth(admin.token)).send({ name: '8º B' });
    const classId = cls.body.class.id;
    await request(app).post(`/api/classes/${classId}/students`).set(auth(admin.token))
      .send({ name: 'Lia', email: 'lia@aluno.org' }).expect(201);
    const act = await request(app).post('/api/activities').set(auth(admin.token)).send({
      title: 'Frações', question: 'O que é?', rubric: 'Partes de um todo.', classId,
    });
    await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(admin.token)).send({
      responses: [{ student_name: 'Lia', email: 'lia@aluno.org', original_response: 'Fração é uma parte de um todo dividido.' }],
    }).expect(201);
    await request(app).post(`/api/activities/${act.body.id}/generate`).set(auth(admin.token)).expect(202);
    await waitJob(act.body.id);
    const detail = await request(app).get(`/api/activities/${act.body.id}`).set(auth(admin.token));
    await request(app).post(`/api/feedback/${detail.body.responses[0].feedback_id}/approve`).set(auth(admin.token)).expect(200);

    const created = await request(app).post('/api/org/students').set(auth(admin.token))
      .send({ name: 'Lia', email: 'lia@aluno.org', classId });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const login = await request(app).post('/api/student-auth/login')
      .send({ email: 'lia@aluno.org', password: created.body.tempPassword });
    const acts = await request(app).get('/api/student/activities').set(auth(login.body.token));
    const mine = acts.body.activities.find((a) => a.id === act.body.id);
    assert.match(mine.myAnswer, /parte de um todo/);
    assert.ok(mine.feedback);
  });
});

describe('redefinição de senha pela instituição', () => {
  test('é recusada para professor e aluno que entram com Google', async () => {
    const admin = await register('Admin', 'admin3@escola.dev');
    await request(app).post('/api/org').set(auth(admin.token)).send({ name: 'Escola G' }).expect(201);
    const t = await request(app).post('/api/org/teachers').set(auth(admin.token)).send({ name: 'Gabi', email: 'gabi@gmail.com' });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    const teacherId = getDb().prepare('SELECT id FROM teachers WHERE email = ?').get('gabi@gmail.com').id;

    // Antes de ligar ao Google, a instituição pode redefinir (fluxo normal)
    assert.equal((await request(app).post(`/api/org/teachers/${teacherId}/reset-password`).set(auth(admin.token))).status, 200);

    getDb().prepare("UPDATE teachers SET google_uid = 'uid-gabi' WHERE id = ?").run(teacherId);
    const blocked = await request(app).post(`/api/org/teachers/${teacherId}/reset-password`).set(auth(admin.token));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.tempPassword, undefined);

    const cls = await request(app).post('/api/classes').set(auth(admin.token)).send({ name: '7º C' });
    const st = await request(app).post('/api/org/students').set(auth(admin.token))
      .send({ name: 'Rui', email: 'rui@gmail.com', classId: cls.body.class.id });
    assert.equal(st.status, 201);
    const accountId = getDb().prepare('SELECT id FROM student_accounts WHERE email = ?').get('rui@gmail.com').id;
    getDb().prepare("UPDATE student_accounts SET google_uid = 'uid-rui' WHERE id = ?").run(accountId);
    const blockedStudent = await request(app).post(`/api/org/students/${accountId}/reset-password`).set(auth(admin.token));
    assert.equal(blockedStudent.status, 403);
    assert.equal(blockedStudent.body.tempPassword, undefined);
  });
});

describe('critérios revisados pelo professor', () => {
  test('lista inválida é recusada e o portal do aluno continua funcionando', async () => {
    const real = await realTeacherWithGradedStudent('real4@escola.dev', 'aluna4@aluno.org');
    for (const criteriaScores of [[null], ['texto'], [{ criterio: '', atendido: true }], [{ criterio: 'x', atendido: 'sim' }], 'abc']) {
      const res = await request(app).patch(`/api/feedback/${real.feedbackId}`).set(auth(real.prof.token)).send({ criteriaScores });
      assert.equal(res.status, 400, `deveria recusar ${JSON.stringify(criteriaScores)}`);
    }
    const ok = await request(app).patch(`/api/feedback/${real.feedbackId}`).set(auth(real.prof.token))
      .send({ criteriaScores: [{ criterio: 'Evaporação', atendido: true, evidencia: 'citou' }] });
    assert.equal(ok.status, 200);

    // Mesmo com um dado antigo inválido no banco, o portal não quebra
    getDb().prepare('UPDATE feedbacks SET criteria_scores = ? WHERE id = ?').run(JSON.stringify([null, { criterio: 'Chuva', atendido: true }]), real.feedbackId);
    getDb().prepare("UPDATE feedbacks SET status = 'aprovado' WHERE id = ?").run(real.feedbackId);
    const account = await request(app).post('/api/student-auth/register')
      .send({ name: 'Aluna 4', email: 'outra4@aluno.org', password: 'SenhaForte@2026', classCode: real.classCode });
    assert.equal(account.status, 201, JSON.stringify(account.body));
    const st = account.body.token;
    // Liga a resposta corrigida a esta conta para o portal mostrar o feedback
    const studentRow = getDb().prepare('SELECT id FROM students WHERE account_id = ?').get(account.body.student.id);
    getDb().prepare('UPDATE student_responses SET student_id = ? WHERE activity_id = ?').run(studentRow.id, real.activityId);
    const acts = await request(app).get('/api/student/activities').set(auth(st));
    assert.equal(acts.status, 200);
    const mine = acts.body.activities.find((a) => a.id === real.activityId);
    assert.deepEqual(mine.criteria, [{ criterio: 'Chuva', atendido: true }]);
  });
});

describe('entradas com tipo errado', () => {
  test('dão 400 em vez de erro interno', async () => {
    const prof = await register('Prof Tipos', 'tipos@escola.dev');
    assert.equal((await request(app).post('/api/auth/register').send({ name: 'X', email: 'x@y.dev', password: 12345678 })).status, 400);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 123, password: 'abc' })).status, 400);
    assert.equal((await request(app).post('/api/classes').set(auth(prof.token)).send({ name: 42 })).status, 400);
    assert.equal((await request(app).post('/api/classes').set(auth(prof.token)).send({ name: 'Ok', schoolYear: 2026 })).status, 400);
    const cls = await request(app).post('/api/classes').set(auth(prof.token)).send({ name: '6º A' });
    const classId = cls.body.class.id;
    assert.equal((await request(app).post(`/api/classes/${classId}/students`).set(auth(prof.token)).send({ name: 'Ana', email: 99 })).status, 400);
    const batch = await request(app).post(`/api/classes/${classId}/students`).set(auth(prof.token))
      .send({ students: [{ name: 7 }, { name: 'Beto', email: 5 }, null] });
    assert.equal(batch.status, 201);
    assert.equal(batch.body.count, 1, 'só o aluno válido entra; e-mail inválido é ignorado');

    const act = await request(app).post('/api/activities').set(auth(prof.token)).send({ title: 'T', question: 'Q?', rubric: 'R.', classId });
    const manual = await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(prof.token))
      .send({ responses: [{ student_name: 'Ana', original_response: 'Uma resposta.', email: 123 }] });
    assert.equal(manual.status, 201, JSON.stringify(manual.body));
  });

  test('student_id de aluno de outra turma é ignorado', async () => {
    const prof = await register('Prof Turmas', 'turmas@escola.dev');
    const c1 = await request(app).post('/api/classes').set(auth(prof.token)).send({ name: 'C1' });
    const c2 = await request(app).post('/api/classes').set(auth(prof.token)).send({ name: 'C2' });
    const other = await request(app).post(`/api/classes/${c2.body.class.id}/students`).set(auth(prof.token)).send({ name: 'Zé' });
    const act = await request(app).post('/api/activities').set(auth(prof.token)).send({ title: 'T', question: 'Q?', rubric: 'R.', classId: c1.body.class.id });
    await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(prof.token))
      .send({ responses: [{ student_name: 'Zé', original_response: 'Resposta.', student_id: other.body.student.id }] }).expect(201);
    const row = getDb().prepare('SELECT student_id FROM student_responses WHERE activity_id = ?').get(act.body.id);
    assert.equal(row.student_id, null);
  });
});
