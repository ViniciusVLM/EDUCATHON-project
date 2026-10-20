/**
 * Instituições, planos/cota, chave própria do Gemini, portal do aluno, nota do professor,
 * questões objetivas e login com Google (Firebase).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-instituicoes-planos-32-caracteres!!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';
process.env.FREE_MONTHLY_QUOTA = '4';
process.env.FIREBASE_PROJECT_ID = 'educathon-teste';

const { default: authRouter } = await import('../routes/auth.js');
const { default: classesRouter } = await import('../routes/classes.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { default: orgRouter } = await import('../routes/org.js');
const { default: billingRouter } = await import('../routes/billing.js');
const { default: studentAuthRouter } = await import('../routes/studentAuth.js');
const { default: studentRouter } = await import('../routes/student.js');
const { requireAuth, requireStudent } = await import('../middleware/auth.js');
const { getDb } = await import('../database/db.js');
const { getProgress } = await import('../services/queue.js');
const { encryptSecret, decryptSecret, normalizeJoinCode } = await import('../services/secrets.js');
const { parseChosenOption } = await import('../services/objective.js');
const { setCertFetcher } = await import('../services/firebaseAuth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/student-auth', studentAuthRouter);
  app.use('/api/student', requireStudent, studentRouter);
  app.use('/api/org', requireAuth, orgRouter);
  app.use('/api/billing', requireAuth, billingRouter);
  app.use('/api/classes', requireAuth, classesRouter);
  app.use('/api/activities', requireAuth, activitiesRouter);
  app.use('/api/activities', requireAuth, studentsRouter);
  app.use('/api', requireAuth, feedbackRouter);
  return app;
}

const app = buildApp();

// Chave falsa do "Google" para gerar ID tokens do Firebase nos testes
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
function idToken(claims = {}, { aud = 'educathon-teste', kid = 'chave1' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { sub: 'uid-gi', email: 'gi@gmail.com', email_verified: true, name: 'Giovana Prado', auth_time: now, ...claims },
    privateKey,
    { algorithm: 'RS256', keyid: kid, audience: aud, issuer: `https://securetoken.google.com/${aud}`, expiresIn: '1h' }
  );
}

setCertFetcher(async () => ({ certs: { chave1: publicPem }, maxAgeSeconds: 3600 }));
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function registerTeacher(name, email) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'SenhaForte@2026' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.token, id: res.body.teacher.id };
}

async function waitJob(activityId) {
  for (let i = 0; i < 200; i++) {
    const p = getProgress(activityId);
    if (p.status === 'complete' || p.status === 'error') return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job não terminou');
}

// ──────────────────────────────────────────
describe('Utilitários', () => {
  test('criptografa a chave e detecta adulteração', () => {
    const enc = encryptSecret('AIzaChaveDeTeste1234567890abcdefghij');
    assert.ok(!enc.includes('AIza'));
    assert.equal(decryptSecret(enc), 'AIzaChaveDeTeste1234567890abcdefghij');
    const parts = enc.split(':');
    parts[3] = Buffer.from('outro').toString('base64');
    assert.equal(decryptSecret(parts.join(':')), null);
  });

  test('normaliza o código da turma', () => {
    assert.equal(normalizeJoinCode('abc 2345'), 'ABC-2345');
    assert.equal(normalizeJoinCode('ABC-2345'), 'ABC-2345');
    assert.equal(normalizeJoinCode('ABC-23'), null);
  });

  test('entende a alternativa marcada pelo aluno', () => {
    const opts = [{ letra: 'A', texto: 'A água evapora' }, { letra: 'B', texto: 'Condensação' }];
    assert.equal(parseChosenOption('b)', opts), 'B');
    assert.equal(parseChosenOption('Letra A', opts), 'A');
    assert.equal(parseChosenOption('condensação', opts), 'B');
    assert.equal(parseChosenOption('A água evapora', opts), 'A');
    assert.equal(parseChosenOption('não sei', opts), null);
    assert.equal(parseChosenOption('E', opts), null, 'letra fora das alternativas');
  });
});

// ──────────────────────────────────────────
describe('Portal do aluno, código da turma e nota do professor', () => {
  let prof;
  let outroProf;
  let classId;
  let joinCode;
  let activityId;
  let studentToken;
  let intruderToken;

  before(async () => {
    prof = await registerTeacher('Profa. Lia', 'lia@escola.org');
    outroProf = await registerTeacher('Prof. Rui', 'rui@escola.org');
    const cls = await request(app).post('/api/classes').set(auth(prof.token)).send({ name: '9º Ano A' });
    classId = cls.body.class.id;
    // Aluna já cadastrada pela professora, com e-mail
    await request(app).post(`/api/classes/${classId}/students`).set(auth(prof.token))
      .send({ name: 'Beatriz Souza', email: 'bia@aluno.org' });

    const act = await request(app).post('/api/activities').set(auth(prof.token)).send({
      title: 'Água', question: 'Explique o ciclo da água.', rubric: 'Evaporação, condensação, precipitação.',
      classId, subject: 'Ciências',
    });
    activityId = act.body.id;
    await request(app).post(`/api/activities/${activityId}/manual`).set(auth(prof.token)).send({
      responses: [
        { student_name: 'Beatriz Souza', original_response: 'A água evapora, condensa nas nuvens e cai como chuva.', email: 'bia@aluno.org' },
        { student_name: 'Caio Lima', original_response: 'A água some no calor.' },
      ],
    });
  });

  test('só o dono da turma gera o código', async () => {
    const other = await request(app).post(`/api/classes/${classId}/join-code`).set(auth(outroProf.token));
    assert.equal(other.status, 404);
    const res = await request(app).post(`/api/classes/${classId}/join-code`).set(auth(prof.token));
    assert.equal(res.status, 200);
    assert.match(res.body.joinCode, /^[A-Z]{3}-\d{4}$/);
    joinCode = res.body.joinCode;
  });

  test('cadastro com senha usando o e-mail de um colega não puxa as notas dele', async () => {
    const bad = await request(app).post('/api/student-auth/register')
      .send({ name: 'Bia', email: 'bia@aluno.org', password: 'senha-da-bia', classCode: 'ZZZ-9999' });
    assert.equal(bad.status, 404);

    const res = await request(app).post('/api/student-auth/register')
      .send({ name: 'Intrusa', email: 'BIA@aluno.org', password: 'senha-intrusa', classCode: joinCode.toLowerCase() });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.joinedClass.id, classId);
    intruderToken = res.body.token;

    const roster = getDb().prepare("SELECT account_id FROM students WHERE class_id = ? AND email = 'bia@aluno.org'").get(classId);
    assert.equal(roster.account_id, null, 'e-mail não verificado não liga ao cadastro do professor');
    const portal = await request(app).get('/api/student/activities').set(auth(intruderToken));
    assert.equal(portal.body.activities[0].situation, 'sem_entrega');
  });

  test('a dona do e-mail entra com Google: a senha antiga e as sessões antigas deixam de valer', async () => {
    const res = await request(app).post('/api/student-auth/google')
      .send({ idToken: idToken({ sub: 'uid-bia', email: 'bia@aluno.org', name: 'Beatriz Souza' }) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.message, /entra com o Google/);
    studentToken = res.body.token;

    const oldPassword = await request(app).post('/api/student-auth/login').send({ email: 'bia@aluno.org', password: 'senha-intrusa' });
    assert.equal(oldPassword.status, 401);
    const oldSession = await request(app).get('/api/student/activities').set(auth(intruderToken));
    assert.equal(oldSession.status, 401);

    const rows = getDb().prepare('SELECT COUNT(*) AS n FROM students WHERE class_id = ? AND account_id IS NOT NULL').get(classId);
    assert.equal(rows.n, 1, 'troca o cadastro criado pela intrusa pelo cadastro da professora');
    const roster = getDb().prepare("SELECT account_id FROM students WHERE class_id = ? AND email = 'bia@aluno.org'").get(classId);
    assert.ok(roster.account_id);
  });

  test('tokens de aluno não entram nas rotas de professor e vice-versa', async () => {
    const asTeacher = await request(app).get('/api/activities').set(auth(studentToken));
    assert.equal(asTeacher.status, 403);
    const asStudent = await request(app).get('/api/student/activities').set(auth(prof.token));
    assert.equal(asStudent.status, 403);
  });

  test('antes da aprovação, o aluno não vê feedback nem nota', async () => {
    await request(app).post(`/api/activities/${activityId}/generate`).set(auth(prof.token));
    await waitJob(activityId);
    const act = await request(app).get(`/api/activities/${activityId}`).set(auth(prof.token));
    const bia = act.body.responses.find((r) => r.student_name === 'Beatriz Souza');
    await request(app).patch(`/api/feedback/${bia.feedback_id}`).set(auth(prof.token)).send({ teacherGrade: 9 });

    const res = await request(app).get('/api/student/activities').set(auth(studentToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.activities.length, 1);
    const [a] = res.body.activities;
    assert.equal(a.situation, 'em_correcao');
    assert.equal(a.feedback, null);
    assert.equal(a.grade, null);
    assert.match(a.myAnswer, /evapora/);
  });

  test('nota: valida, aceita vírgula e não muda o status de um feedback aprovado', async () => {
    const act = await request(app).get(`/api/activities/${activityId}`).set(auth(prof.token));
    const bia = act.body.responses.find((r) => r.student_name === 'Beatriz Souza');

    const invalid = await request(app).patch(`/api/feedback/${bia.feedback_id}`).set(auth(prof.token)).send({ teacherGrade: 11 });
    assert.equal(invalid.status, 400);
    const otherTeacher = await request(app).patch(`/api/feedback/${bia.feedback_id}`).set(auth(outroProf.token)).send({ teacherGrade: 5 });
    assert.equal(otherTeacher.status, 404);

    await request(app).post(`/api/feedback/${bia.feedback_id}/approve`).set(auth(prof.token));
    const graded = await request(app).patch(`/api/feedback/${bia.feedback_id}`).set(auth(prof.token)).send({ teacherGrade: '8,5' });
    assert.equal(graded.status, 200);
    assert.equal(graded.body.status, 'aprovado');
    assert.equal(graded.body.teacherGrade, 8.5);
  });

  test('depois da aprovação, o aluno vê feedback, nota e média da matéria — só dele', async () => {
    const res = await request(app).get('/api/student/activities').set(auth(studentToken));
    const [a] = res.body.activities;
    assert.equal(a.situation, 'corrigida');
    assert.equal(a.grade, 8.5);
    assert.ok(a.feedback.length > 10);
    assert.deepEqual(res.body.subjects, [
      { subject: 'Ciências', activities: 1, corrected: 1, gradesCount: 1, average: 8.5 },
    ]);
    assert.ok(!JSON.stringify(res.body).includes('Caio'), 'não vaza dados de colegas');
  });

  test('exportação traz a coluna de nota', async () => {
    const res = await request(app).get(`/api/activities/${activityId}/export`).set(auth(prof.token));
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('nome_aluno,resposta_original,feedback_final,nota,status'));
    assert.ok(res.text.includes('"8,5"'));
  });

  test('regenerar mantém a nota lançada', async () => {
    const act = await request(app).get(`/api/activities/${activityId}`).set(auth(prof.token));
    const bia = act.body.responses.find((r) => r.student_name === 'Beatriz Souza');
    const res = await request(app).post(`/api/feedback/${bia.feedback_id}/regenerate`).set(auth(prof.token));
    assert.equal(res.status, 200);
    const after = await request(app).get(`/api/activities/${activityId}`).set(auth(prof.token));
    assert.equal(after.body.responses.find((r) => r.student_name === 'Beatriz Souza').teacher_grade, 8.5);
  });

  test('nome repetido na turma não liga resposta automaticamente', async () => {
    // Alguém entra pelo código usando o nome de um colega
    const impostor = await request(app).post('/api/student-auth/register')
      .send({ name: 'Caio Lima', email: 'outro@aluno.org', password: 'senha-qualquer', classCode: joinCode });
    assert.equal(impostor.status, 201);
    await request(app).post(`/api/classes/${classId}/students`).set(auth(prof.token)).send({ name: 'Caio Lima' });
    await request(app).post(`/api/activities/${activityId}/manual`).set(auth(prof.token)).send({
      responses: [{ student_name: 'Caio Lima', original_response: 'Outra resposta do Caio.' }],
    });
    const res = await request(app).get('/api/student/activities').set(auth(impostor.body.token));
    assert.equal(res.body.activities[0].situation, 'sem_entrega');
  });

  test('quem entra pelo código com o nome de um colega não recebe a resposta dele', async () => {
    const impostor = await request(app).post('/api/student-auth/register')
      .send({ name: 'Elisa Nunes', email: 'falsa@aluno.org', password: 'senha-qualquer', classCode: joinCode });
    await request(app).post(`/api/activities/${activityId}/manual`).set(auth(prof.token)).send({
      responses: [{ student_name: 'Elisa Nunes', original_response: 'Resposta da Elisa verdadeira.' }],
    });
    const res = await request(app).get('/api/student/activities').set(auth(impostor.body.token));
    assert.equal(res.body.activities[0].situation, 'sem_entrega');
  });

  test('aluno entra em outra turma pelo código, faz login e troca a senha', async () => {
    const cls2 = await request(app).post('/api/classes').set(auth(outroProf.token)).send({ name: '1ª Série B' });
    const code2 = (await request(app).post(`/api/classes/${cls2.body.class.id}/join-code`).set(auth(outroProf.token))).body.joinCode;

    await request(app).post('/api/student-auth/register')
      .send({ name: 'Duda Reis', email: 'duda@aluno.org', password: 'senha-da-duda', classCode: joinCode });
    const login = await request(app).post('/api/student-auth/login').send({ email: 'duda@aluno.org', password: 'senha-da-duda' });
    assert.equal(login.status, 200);
    const join = await request(app).post('/api/student/join').set(auth(login.body.token)).send({ classCode: code2 });
    assert.equal(join.status, 201);
    const again = await request(app).post('/api/student/join').set(auth(login.body.token)).send({ classCode: code2 });
    assert.equal(again.status, 200);
    const me = await request(app).get('/api/student/me').set(auth(login.body.token));
    assert.equal(me.body.classes.length, 2);

    const wrong = await request(app).post('/api/student/password').set(auth(login.body.token))
      .send({ currentPassword: 'errada', newPassword: 'nova-senha-123' });
    assert.equal(wrong.status, 401);
    const changed = await request(app).post('/api/student/password').set(auth(login.body.token))
      .send({ currentPassword: 'senha-da-duda', newPassword: 'nova-senha-123' });
    assert.equal(changed.status, 200);
    assert.equal((await request(app).get('/api/student/me').set(auth(login.body.token))).status, 401, 'sessão antiga cai');
    assert.equal((await request(app).get('/api/student/me').set(auth(changed.body.token))).status, 200);
  });
});

// ──────────────────────────────────────────
describe('Planos, cota e chave própria', () => {
  let prof;
  let activityId;

  before(async () => {
    prof = await registerTeacher('Prof. Cota', 'cota@escola.org');
    const act = await request(app).post('/api/activities').set(auth(prof.token)).send({
      title: 'Cota', question: 'Explique a fotossíntese.', rubric: 'Luz, água, gás carbônico.',
    });
    activityId = act.body.id;
    await request(app).post(`/api/activities/${activityId}/manual`).set(auth(prof.token)).send({
      responses: Array.from({ length: 5 }, (_, i) => ({ student_name: `Aluno ${i + 1}`, original_response: 'A planta usa luz para produzir glicose e oxigênio.' })),
    });
  });

  test('plano gratuito mostra a cota do mês', async () => {
    const res = await request(app).get('/api/billing').set(auth(prof.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.id, 'gratuito');
    assert.equal(res.body.quota, 4);
    assert.equal(res.body.remaining, 4);
    assert.equal(res.body.simulated, true);
    assert.ok(res.body.catalog.some((p) => p.id === 'professor'));
    assert.ok(!res.body.catalog.some((p) => p.id === 'instituicao'), 'professor sem instituição não vê plano institucional');
  });

  test('bloqueia a geração quando falta cota (402)', async () => {
    const res = await request(app).post(`/api/activities/${activityId}/generate`).set(auth(prof.token));
    assert.equal(res.status, 402);
    assert.match(res.body.error, /cota/i);
    assert.equal(res.body.upgradeUrl, '/planos');
  });

  test('pagamento simulado ativa o plano e libera a geração', async () => {
    const wrong = await request(app).post('/api/billing/checkout').set(auth(prof.token)).send({ plan: 'instituicao', method: 'pix' });
    assert.equal(wrong.status, 400);
    const res = await request(app).post('/api/billing/checkout').set(auth(prof.token)).send({ plan: 'professor', method: 'cartao' });
    assert.equal(res.status, 201);
    assert.equal(res.body.simulated, true);
    assert.equal(res.body.status.plan.id, 'professor');
    assert.equal(res.body.status.quota, 1000);

    const gen = await request(app).post(`/api/activities/${activityId}/generate`).set(auth(prof.token));
    assert.equal(gen.status, 202);
    await waitJob(activityId);
    const billing = await request(app).get('/api/billing').set(auth(prof.token));
    assert.equal(billing.body.used, 5);
    assert.equal(billing.body.payments.length, 1);
    assert.equal(billing.body.payments[0].status, 'aprovado_simulado');
  });

  test('reserva a cota antes de gerar e devolve o que falhar', async () => {
    const { setModel, resetModel } = await import('../services/gemini.js');
    const prev = process.env.GEMINI_MOCK;
    delete process.env.GEMINI_MOCK;
    setModel({ async generateContent() { throw Object.assign(new Error('chave inválida'), { status: 400 }); } });
    try {
      const act = await request(app).post('/api/activities').set(auth(prof.token)).send({
        title: 'Falha', question: 'Explique a osmose.', rubric: 'Água, membrana, concentração.',
      });
      await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(prof.token)).send({
        responses: [{ student_name: 'Zé', original_response: 'A água passa pela membrana.' }],
      });
      const before = (await request(app).get('/api/billing').set(auth(prof.token))).body.used;
      const gen = await request(app).post(`/api/activities/${act.body.id}/generate`).set(auth(prof.token));
      assert.equal(gen.status, 202);
      await waitJob(act.body.id);
      assert.equal((await request(app).get('/api/billing').set(auth(prof.token))).body.used, before, 'devolveu a falha');
      const moves = getDb().prepare('SELECT units FROM ai_usage WHERE teacher_id = ? ORDER BY id DESC LIMIT 2').all(prof.id).map((r) => r.units);
      assert.deepEqual(moves, [-1, 1], 'reservou 1 antes de gerar e devolveu 1 depois');
    } finally {
      resetModel();
      process.env.GEMINI_MOCK = prev;
    }
  });

  test('chave própria: valida, guarda criptografada e nunca devolve', async () => {
    const bad = await request(app).put('/api/billing/api-key').set(auth(prof.token)).send({ apiKey: 'minha-chave' });
    assert.equal(bad.status, 400);

    const key = 'AIzaSyTESTE_chave_paga_1234567890abcd';
    const res = await request(app).put('/api/billing/api-key').set(auth(prof.token)).send({ apiKey: key });
    assert.equal(res.status, 200);
    assert.equal(res.body.status.ownKey.configured, true);
    assert.equal(res.body.status.ownKey.last4, 'abcd');
    assert.equal(res.body.status.quota, null, 'com chave própria a plataforma não limita');

    const billing = await request(app).get('/api/billing').set(auth(prof.token));
    assert.ok(!JSON.stringify(billing.body).includes(key));
    const row = getDb().prepare('SELECT gemini_key_enc FROM teachers WHERE id = ?').get(prof.id);
    assert.ok(row.gemini_key_enc && !row.gemini_key_enc.includes(key));

    const del = await request(app).delete('/api/billing/api-key').set(auth(prof.token));
    assert.equal(del.body.status.ownKey.configured, false);
  });
});

// ──────────────────────────────────────────
describe('Instituição', () => {
  let admin;
  let teacherToken;
  let teacherId;
  let orgClassId;
  let individual;

  before(async () => {
    admin = await registerTeacher('Coord. Marta', 'marta@senac.test');
    individual = await registerTeacher('Prof. Solo', 'solo@escola.org');
  });

  test('professor cria a instituição e vira administrador', async () => {
    const res = await request(app).post('/api/org').set(auth(admin.token)).send({ name: 'Escola Técnica Modelo' });
    assert.equal(res.status, 201);
    const again = await request(app).post('/api/org').set(auth(admin.token)).send({ name: 'Outra' });
    assert.equal(again.status, 409);
    const me = await request(app).get('/api/auth/me').set(auth(admin.token));
    assert.equal(me.body.teacher.role, 'org_admin');
    assert.equal(me.body.teacher.organization.name, 'Escola Técnica Modelo');
  });

  test('administrador cria acesso de professor com senha provisória', async () => {
    const res = await request(app).post('/api/org/teachers').set(auth(admin.token)).send({ name: 'Prof. Davi', email: 'davi@senac.test' });
    assert.equal(res.status, 201);
    assert.equal(res.body.tempPassword.length, 10);
    const dup = await request(app).post('/api/org/teachers').set(auth(admin.token)).send({ name: 'Solo', email: 'solo@escola.org' });
    assert.equal(dup.status, 409);

    const login = await request(app).post('/api/auth/login').send({ email: 'davi@senac.test', password: res.body.tempPassword });
    assert.equal(login.status, 200);
    teacherId = login.body.teacher.id;

    // O professor troca a senha provisória: a senha que o administrador viu deixa de valer
    const changed = await request(app).post('/api/auth/password').set(auth(login.body.token))
      .send({ currentPassword: res.body.tempPassword, newPassword: 'SenhaDoDavi@2026' });
    assert.equal(changed.status, 200);
    teacherToken = changed.body.token;
    assert.equal((await request(app).get('/api/auth/me').set(auth(login.body.token))).status, 401);
    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'davi@senac.test', password: res.body.tempPassword });
    assert.equal(oldLogin.status, 401);
  });

  test('só o administrador vê o painel; professor da instituição não muda o plano', async () => {
    assert.equal((await request(app).get('/api/org').set(auth(teacherToken))).status, 403);
    assert.equal((await request(app).get('/api/org').set(auth(individual.token))).status, 403);
    const checkout = await request(app).post('/api/billing/checkout').set(auth(teacherToken)).send({ plan: 'instituicao', method: 'pix' });
    assert.equal(checkout.status, 403);
    const billing = await request(app).get('/api/billing').set(auth(teacherToken));
    assert.equal(billing.body.entity.type, 'organization');
    assert.equal(billing.body.quota, 200);
  });

  test('uso do professor conta na cota da instituição e aparece no painel', async () => {
    const cls = await request(app).post('/api/classes').set(auth(teacherToken)).send({ name: 'Técnico em ADM — T1' });
    orgClassId = cls.body.class.id;
    const act = await request(app).post('/api/activities').set(auth(teacherToken)).send({
      title: 'Liderança', question: 'O que é liderança situacional?', rubric: 'Adapta o estilo ao contexto.', classId: orgClassId,
    });
    await request(app).post(`/api/activities/${act.body.id}/manual`).set(auth(teacherToken)).send({
      responses: [{ student_name: 'Rafa', original_response: 'É adaptar o jeito de liderar à maturidade da equipe.' }],
    });
    await request(app).post(`/api/activities/${act.body.id}/generate`).set(auth(teacherToken));
    await waitJob(act.body.id);

    const res = await request(app).get('/api/org').set(auth(admin.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.quota.used, 1);
    const davi = res.body.teachers.find((t) => t.id === teacherId);
    assert.equal(davi.usage_month, 1);
    assert.equal(davi.classes, 1);
    assert.ok(!JSON.stringify(res.body).includes('maturidade da equipe'), 'admin não vê respostas dos alunos');
  });

  test('administrador cria acesso de aluno e gera código só para turmas da instituição', async () => {
    const soloClass = await request(app).post('/api/classes').set(auth(individual.token)).send({ name: 'Turma de fora' });
    const outside = await request(app).post('/api/org/students').set(auth(admin.token))
      .send({ name: 'Rafa', email: 'rafa@aluno.org', classId: soloClass.body.class.id });
    assert.equal(outside.status, 404);
    const codeOutside = await request(app).post(`/api/org/classes/${soloClass.body.class.id}/join-code`).set(auth(admin.token));
    assert.equal(codeOutside.status, 404);

    const res = await request(app).post('/api/org/students').set(auth(admin.token))
      .send({ name: 'Rafa Gomes', email: 'rafa@aluno.org', classId: orgClassId });
    assert.equal(res.status, 201);
    const login = await request(app).post('/api/student-auth/login').send({ email: 'rafa@aluno.org', password: res.body.tempPassword });
    assert.equal(login.status, 200);
    const again = await request(app).post('/api/org/students').set(auth(admin.token))
      .send({ name: 'Rafa', email: 'rafa@aluno.org', classId: orgClassId });
    assert.equal(again.status, 409, 'não inscreve conta já existente sem o aluno querer');

    const code = await request(app).post(`/api/org/classes/${orgClassId}/join-code`).set(auth(admin.token));
    assert.equal(code.status, 200);
    const panel = await request(app).get('/api/org').set(auth(admin.token));
    assert.equal(panel.body.totals.studentAccounts, 1);
    assert.equal(panel.body.classes[0].join_code, code.body.joinCode);
  });

  test('pagamento simulado do plano institucional pelo administrador', async () => {
    const res = await request(app).post('/api/billing/checkout').set(auth(admin.token)).send({ plan: 'instituicao', method: 'pix' });
    assert.equal(res.status, 201);
    const billing = await request(app).get('/api/billing').set(auth(teacherToken));
    assert.equal(billing.body.plan.id, 'instituicao');
    assert.equal(billing.body.quota, 20000);
  });

  test('administrador remove professor da instituição, mas não a si mesmo', async () => {
    const self = await request(app).delete(`/api/org/teachers/${admin.id}`).set(auth(admin.token));
    assert.equal(self.status, 400);
    const res = await request(app).delete(`/api/org/teachers/${teacherId}`).set(auth(admin.token));
    assert.equal(res.status, 200);
    const billing = await request(app).get('/api/billing').set(auth(teacherToken));
    assert.equal(billing.body.entity.type, 'teacher');
  });
});

// ──────────────────────────────────────────
describe('Questões objetivas', () => {
  let prof;
  let activityId;

  before(async () => {
    prof = await registerTeacher('Prof. Objetiva', 'objetiva@escola.org');
  });

  test('valida alternativas e gabarito', async () => {
    const semGabarito = await request(app).post('/api/activities').set(auth(prof.token)).send({
      title: 'Q1', question: 'Qual é a capital do Brasil?', questionType: 'objetiva',
      options: ['Brasília', 'Rio de Janeiro'],
    });
    assert.equal(semGabarito.status, 400);
    const umaOpcao = await request(app).post('/api/activities').set(auth(prof.token)).send({
      title: 'Q1', question: 'Qual é a capital do Brasil?', questionType: 'objetiva', options: ['Brasília'], correctOption: 'A',
    });
    assert.equal(umaOpcao.status, 400);

    const res = await request(app).post('/api/activities').set(auth(prof.token)).send({
      title: 'Capital', question: 'Qual é a capital do Brasil?', questionType: 'objetiva',
      options: [{ texto: 'Brasília' }, { texto: 'Rio de Janeiro' }, { texto: 'Salvador' }], correctOption: 'a',
    });
    assert.equal(res.status, 201);
    activityId = res.body.id;
    const act = await request(app).get(`/api/activities/${activityId}`).set(auth(prof.token));
    assert.equal(act.body.question_type, 'objetiva');
    assert.equal(act.body.correct_option, 'A');
    assert.equal(act.body.rubric, 'Gabarito: alternativa A.');
  });

  test('corrige pelo gabarito e só usa IA para explicar o erro', async () => {
    await request(app).post(`/api/activities/${activityId}/manual`).set(auth(prof.token)).send({
      responses: [
        { student_name: 'Ana', original_response: 'A' },
        { student_name: 'Bruno', original_response: 'Letra B' },
        { student_name: 'Cris', original_response: 'não lembro' },
      ],
    });
    const gen = await request(app).post(`/api/activities/${activityId}/generate`).set(auth(prof.token));
    assert.equal(gen.status, 202);
    await waitJob(activityId);

    const act = await request(app).get(`/api/activities/${activityId}`).set(auth(prof.token));
    const by = Object.fromEntries(act.body.responses.map((r) => [r.student_name, r]));
    assert.deepEqual(JSON.parse(by.Ana.auto_result), { escolhida: 'A', correta: 'A', acertou: true });
    assert.equal(by.Ana.ai_model, 'correcao-automatica');
    assert.deepEqual(JSON.parse(by.Bruno.auto_result), { escolhida: 'B', correta: 'A', acertou: false });
    assert.match(by.Bruno.ai_feedback_text, /Rio de Janeiro/);
    assert.match(by.Bruno.ai_feedback_text, /Brasília/);
    assert.equal(JSON.parse(by.Cris.auto_result).escolhida, null);
    assert.ok(!/\bnota\b/i.test(by.Bruno.ai_feedback_text), 'IA não fala em nota');

    const billing = await request(app).get('/api/billing').set(auth(prof.token));
    assert.equal(billing.body.used, 1, 'só a resposta errada com alternativa identificada usa IA');
  });
});

// ──────────────────────────────────────────
describe('Login com Google (Firebase)', () => {
  let classCode;

  before(async () => {
    const prof = await registerTeacher('Prof. Google', 'prof.google@escola.org');
    const cls = await request(app).post('/api/classes').set(auth(prof.token)).send({ name: '7º Ano C' });
    classCode = (await request(app).post(`/api/classes/${cls.body.class.id}/join-code`).set(auth(prof.token))).body.joinCode;
  });

  test('cria a conta do professor no primeiro login e reaproveita depois', async () => {
    const first = await request(app).post('/api/auth/google').send({ idToken: idToken() });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await request(app).post('/api/auth/google').send({ idToken: idToken() });
    assert.equal(second.status, 200);
    assert.equal(second.body.teacher.id, first.body.teacher.id);
  });

  test('liga ao cadastro existente com o mesmo e-mail verificado', async () => {
    const res = await request(app).post('/api/auth/google')
      .send({ idToken: idToken({ sub: 'uid-lia', email: 'lia@escola.org', name: 'Lia' }) });
    assert.equal(res.status, 200);
    assert.equal(res.body.teacher.email, 'lia@escola.org');
    const oldPassword = await request(app).post('/api/auth/login').send({ email: 'lia@escola.org', password: 'SenhaForte@2026' });
    assert.equal(oldPassword.status, 401, 'senha antiga deixa de valer depois de ligar ao Google');
    const otherGoogle = await request(app).post('/api/auth/google')
      .send({ idToken: idToken({ sub: 'uid-outro', email: 'lia@escola.org', name: 'Lia' }) });
    assert.equal(otherGoogle.status, 409);
  });

  test('recusa token de outro projeto, chave desconhecida ou e-mail não verificado', async () => {
    assert.equal((await request(app).post('/api/auth/google').send({ idToken: idToken({}, { aud: 'outro-projeto' }) })).status, 401);
    assert.equal((await request(app).post('/api/auth/google').send({ idToken: idToken({}, { kid: 'nao-existe' }) })).status, 401);
    assert.equal((await request(app).post('/api/auth/google').send({ idToken: idToken({ email_verified: false, sub: 'x2' }) })).status, 403);
    assert.equal((await request(app).post('/api/auth/google').send({ idToken: 'abc' })).status, 401);
  });

  test('aluno com Google precisa do código da turma no primeiro acesso', async () => {
    const token = idToken({ sub: 'uid-aluno', email: 'aluno.google@gmail.com', name: 'Theo' });
    const first = await request(app).post('/api/student-auth/google').send({ idToken: token });
    assert.equal(first.status, 400);
    assert.equal(first.body.needsClassCode, true);
    const ok = await request(app).post('/api/student-auth/google').send({ idToken: token, classCode });
    assert.equal(ok.status, 201);
    const again = await request(app).post('/api/student-auth/google').send({ idToken: token });
    assert.equal(again.status, 200);
  });

  test('sem FIREBASE_PROJECT_ID o login com Google fica desligado', async () => {
    const saved = process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_PROJECT_ID;
    try {
      const res = await request(app).post('/api/auth/google').send({ idToken: idToken() });
      assert.equal(res.status, 503);
      const providers = await request(app).get('/api/auth/providers');
      assert.equal(providers.body.google, false);
    } finally {
      process.env.FIREBASE_PROJECT_ID = saved;
    }
  });
});
