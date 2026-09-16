/**
 * Testes de integração e unitários para o módulo de autenticação.
 * Usa supertest + banco SQLite em memória (:memory:).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key-auth-tests';

const { default: authRouter } = await import('../routes/auth.js');
const { hashPassword, comparePassword, generateToken, verifyToken } = await import('../services/auth.js');
const { requireAuth } = await import('../middleware/auth.js');

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/auth', authRouter);

  // Rota de teste para validar o middleware requireAuth
  app.get('/api/test-protected', requireAuth, (req, res) => {
    res.json({ ok: true, teacher: req.teacher });
  });

  return app;
}

const app = buildApp();

describe('Auth Service — Funções Criptográficas e Token', () => {
  test('gera e compara hash de senha corretamente', async () => {
    const password = 'minhaSenhaSegura123';
    const hash = await hashPassword(password);

    assert.notEqual(password, hash);
    assert.equal(await comparePassword(password, hash), true);
    assert.equal(await comparePassword('senhaErrada', hash), false);
  });

  test('gera e valida token JWT com sucesso', () => {
    const teacher = { id: 42, name: 'Prof. Teste', email: 'prof@escola.org' };
    const token = generateToken(teacher);

    assert.ok(typeof token === 'string' && token.length > 20);

    const decoded = verifyToken(token);
    assert.equal(decoded.id, 42);
    assert.equal(decoded.name, 'Prof. Teste');
    assert.equal(decoded.email, 'prof@escola.org');
  });

  test('falha na validação de token inválido', () => {
    assert.throws(() => verifyToken('token.invalido.aqui'));
  });
});

describe('POST /api/auth/register', () => {
  test('cadastra novo professor com sucesso e retorna token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Professora Ana',
      email: 'ana@educathon.org',
      password: 'senhaForte123',
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.teacher.name, 'Professora Ana');
    assert.equal(res.body.teacher.email, 'ana@educathon.org');
    assert.ok(res.body.teacher.id > 0);
  });

  test('rejeita e-mail duplicado com status 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Outra Ana',
      email: 'ana@educathon.org',
      password: 'outraSenha123',
    });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /já está cadastrado/i);
  });

  test('rejeita senha curta (< 6 caracteres)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Prof. João',
      email: 'joao@educathon.org',
      password: '123',
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /pelo menos 6 caracteres/i);
  });

  test('rejeita formato de e-mail inválido', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Prof. Inválido',
      email: 'email-sem-arroba',
      password: 'senhaValida123',
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /e-mail válido/i);
  });

  test('rejeita requisição com campos ausentes', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'incompleto@educathon.org',
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

describe('POST /api/auth/login', () => {
  test('realiza login com credenciais válidas', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'ana@educathon.org',
      password: 'senhaForte123',
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.teacher.email, 'ana@educathon.org');
  });

  test('rejeita senha incorreta com 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'ana@educathon.org',
      password: 'senhaTotalmenteErrada',
    });

    assert.equal(res.status, 401);
    assert.match(res.body.error, /incorretos/i);
  });

  test('rejeita e-mail inexistente com 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'naoexiste@educathon.org',
      password: 'senhaQualquer123',
    });

    assert.equal(res.status, 401);
    assert.match(res.body.error, /incorretos/i);
  });
});

describe('GET /api/auth/me e Middleware requireAuth', () => {
  test('bloqueia rota protegida sem header Authorization', async () => {
    const res = await request(app).get('/api/test-protected');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /não autorizado/i);
  });

  test('bloqueia rota com token malformado ou inválido', async () => {
    const res = await request(app)
      .get('/api/test-protected')
      .set('Authorization', 'Bearer token_falso_123');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /inválido/i);
  });

  test('permite acesso com token válido e retorna dados do professor', async () => {
    // Faz login primeiro para obter token
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'ana@educathon.org',
      password: 'senhaForte123',
    });
    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.teacher.email, 'ana@educathon.org');
    assert.equal(meRes.body.teacher.name, 'Professora Ana');
  });
});
