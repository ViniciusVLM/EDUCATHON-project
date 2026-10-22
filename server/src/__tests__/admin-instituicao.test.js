/**
 * Administrador geral da instituição: redefinir senhas, promover administradores, ver atividades
 * da escola (só contagens) e gerenciar o acesso dos alunos.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-admin-instituicao-32-caracteres!!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';

const { default: authRouter } = await import('../routes/auth.js');
const { default: classesRouter } = await import('../routes/classes.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: orgRouter } = await import('../routes/org.js');
const { default: studentAuthRouter } = await import('../routes/studentAuth.js');
const { default: studentRouter } = await import('../routes/student.js');
const { requireAuth, requireStudent } = await import('../middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/student-auth', studentAuthRouter);
app.use('/api/student', requireStudent, studentRouter);
app.use('/api/org', requireAuth, orgRouter);
app.use('/api/classes', requireAuth, classesRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function register(name, email) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'SenhaForte@2026' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.token, id: res.body.teacher.id };
}

async function login(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

let admin; let profToken; let profId; let classId; let studentId; let studentPass; let otherOrgClassCode;

before(async () => {
  admin = await register('Diretora Clara', 'clara@escola.org');
  await request(app).post('/api/org').set(auth(admin.token)).send({ name: 'Escola Modelo' }).expect(201);
  const t = await request(app).post('/api/org/teachers').set(auth(admin.token)).send({ name: 'Prof. Davi', email: 'davi@escola.org' });
  profId = t.body.teacher.id;
  profToken = (await login('davi@escola.org', t.body.tempPassword)).body.token;
  const cls = await request(app).post('/api/classes').set(auth(profToken)).send({ name: '8º Ano A' });
  classId = cls.body.class.id;
  const st = await request(app).post('/api/org/students').set(auth(admin.token))
    .send({ name: 'Lia Souza', email: 'lia@aluno.org', classId });
  studentId = st.body.student.id;
  studentPass = st.body.tempPassword;

  // Uma turma de outra escola, para testar o limite do administrador
  const outra = await register('Diretor Paulo', 'paulo@outra.org');
  await request(app).post('/api/org').set(auth(outra.token)).send({ name: 'Outra Escola' }).expect(201);
  const c2 = await request(app).post('/api/classes').set(auth(outra.token)).send({ name: '9º Ano B' });
  const code = await request(app).post(`/api/org/classes/${c2.body.class.id}/join-code`).set(auth(outra.token));
  otherOrgClassCode = code.body.joinCode;
});

describe('professores', () => {
  test('redefinir senha: senha antiga e sessão antiga deixam de valer', async () => {
    const res = await request(app).post(`/api/org/teachers/${profId}/reset-password`).set(auth(admin.token));
    assert.equal(res.status, 200);
    assert.ok(res.body.tempPassword.length >= 8);
    assert.equal((await request(app).get('/api/classes').set(auth(profToken))).status, 401, 'sessão antiga cai');
    const novo = await login('davi@escola.org', res.body.tempPassword);
    assert.equal(novo.status, 200);
    profToken = novo.body.token;
    await request(app).post(`/api/org/teachers/${admin.id}/reset-password`).set(auth(admin.token)).expect(400);
    await request(app).post(`/api/org/teachers/${profId}/reset-password`).set(auth(profToken)).expect(403);
  });

  test('promover e tirar administrador, sem deixar a escola sem nenhum', async () => {
    await request(app).patch(`/api/org/teachers/${admin.id}/role`).set(auth(admin.token)).send({ role: 'teacher' }).expect(400);
    await request(app).patch(`/api/org/teachers/${profId}/role`).set(auth(admin.token)).send({ role: 'chefe' }).expect(400);
    await request(app).patch(`/api/org/teachers/${profId}/role`).set(auth(admin.token)).send({ role: 'org_admin' }).expect(200);
    // Agora o professor também administra
    assert.equal((await request(app).get('/api/org').set(auth(profToken))).status, 200);
    // Com dois administradores, a diretora pode deixar de ser
    await request(app).patch(`/api/org/teachers/${admin.id}/role`).set(auth(profToken)).send({ role: 'teacher' }).expect(200);
    assert.equal((await request(app).get('/api/org').set(auth(admin.token))).status, 403);
    // Volta ao normal
    await request(app).patch(`/api/org/teachers/${admin.id}/role`).set(auth(profToken)).send({ role: 'org_admin' }).expect(200);
    await request(app).patch(`/api/org/teachers/${profId}/role`).set(auth(admin.token)).send({ role: 'teacher' }).expect(200);
  });
});

describe('atividades da escola', () => {
  test('lista com andamento e sem dados dos alunos', async () => {
    const act = await request(app).post('/api/activities').set(auth(profToken))
      .send({ title: 'Ciclo da água', question: 'Explique.', rubric: 'Evaporação.', classId });
    await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(profToken))
      .send({ responses: [{ student_name: 'Lia Souza', original_response: 'A água evapora.' }] }).expect(201);
    const res = await request(app).get('/api/org/activities').set(auth(admin.token));
    assert.equal(res.status, 200);
    const a = res.body.activities.find((x) => x.id === act.body.id);
    assert.equal(a.teacher_name, 'Prof. Davi');
    assert.equal(a.class_name, '8º Ano A');
    assert.equal(a.responses, 1);
    assert.equal(a.approved, 0);
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /A água evapora|Lia Souza/, 'nada de respostas nem nomes de alunos');
    await request(app).get('/api/org/activities').set(auth(profToken)).expect(403);
  });
});

describe('alunos', () => {
  test('redefinir senha do aluno', async () => {
    const res = await request(app).post(`/api/org/students/${studentId}/reset-password`).set(auth(admin.token));
    assert.equal(res.status, 200);
    await request(app).post('/api/student-auth/login').send({ email: 'lia@aluno.org', password: studentPass }).expect(401);
    const ok = await request(app).post('/api/student-auth/login').send({ email: 'lia@aluno.org', password: res.body.tempPassword });
    assert.equal(ok.status, 200);
    studentPass = res.body.tempPassword;
  });

  test('desativar bloqueia login e sessão; reativar devolve o acesso', async () => {
    const before = await request(app).post('/api/student-auth/login').send({ email: 'lia@aluno.org', password: studentPass });
    const token = before.body.token;
    await request(app).patch(`/api/org/students/${studentId}`).set(auth(admin.token)).send({ disabled: true }).expect(200);
    await request(app).get('/api/student/me').set(auth(token)).expect(401);
    const blocked = await request(app).post('/api/student-auth/login').send({ email: 'lia@aluno.org', password: studentPass });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error, /desativado/);
    const list = await request(app).get('/api/org').set(auth(admin.token));
    assert.ok(list.body.students.find((s) => s.id === studentId).disabled_at);
    await request(app).patch(`/api/org/students/${studentId}`).set(auth(admin.token)).send({ disabled: false }).expect(200);
    await request(app).post('/api/student-auth/login').send({ email: 'lia@aluno.org', password: studentPass }).expect(200);
  });

  test('tirar da turma: o aluno deixa de ver a turma', async () => {
    const tk = (await request(app).post('/api/student-auth/login').send({ email: 'lia@aluno.org', password: studentPass })).body.token;
    assert.equal((await request(app).get('/api/student/me').set(auth(tk))).body.classes.length, 1);
    await request(app).delete(`/api/org/students/${studentId}/classes/${classId}`).set(auth(admin.token)).expect(200);
    assert.equal((await request(app).get('/api/student/me').set(auth(tk))).body.classes.length, 0);
    await request(app).delete(`/api/org/students/${studentId}/classes/${classId}`).set(auth(admin.token)).expect(404);
  });

  test('aluno que também estuda em outra escola não pode ser alterado', async () => {
    const reg = await request(app).post('/api/student-auth/register')
      .send({ name: 'Theo Lima', email: 'theo@aluno.org', password: 'SenhaDoTheo1', classCode: otherOrgClassCode });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const theoToken = reg.body.token;
    // Entra também numa turma da Escola Modelo
    const code = await request(app).post(`/api/org/classes/${classId}/join-code`).set(auth(admin.token));
    await request(app).post('/api/student/join').set(auth(theoToken)).send({ classCode: code.body.joinCode }).expect(201);
    const theoId = reg.body.student.id;
    const res = await request(app).post(`/api/org/students/${theoId}/reset-password`).set(auth(admin.token));
    assert.equal(res.status, 403);
    await request(app).patch(`/api/org/students/${theoId}`).set(auth(admin.token)).send({ disabled: true }).expect(403);
    // Aluno sem ligação com a escola: 404
    await request(app).post('/api/org/students/99999/reset-password').set(auth(admin.token)).expect(404);
  });
});
