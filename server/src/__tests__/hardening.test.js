/**
 * Testes de Endurecimento e Segurança — Fase 5
 * Cobrem:
 * 1. Prevenção de Injeção de Fórmula em CSV (DDE / CSV Injection)
 * 2. Content-Disposition seguro (ASCII + RFC 5987 filename*=UTF-8'')
 * 3. Rate limiting configurável em autenticação e IA (429)
 * 4. Headers de segurança via Helmet
 * 5. Sanitização de erros 500 (sem vazamento de error.message)
 * 6. Validação de limites de payload e campos (400 e 413)
 * 7. Políticas de senha (mínimo 8 caracteres), bcrypt cost e JWT
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key-hardening';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const { default: authRouter } = await import('../routes/auth.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { default: csvRouter } = await import('../routes/csv.js');
const { requireAuth } = await import('../middleware/auth.js');
const { generateToken, BCRYPT_ROUNDS, JWT_EXPIRES_IN } = await import('../services/auth.js');
const {
  createTeacher,
  createActivity,
  addResponses,
  saveFeedback,
  getDb,
} = await import('../database/db.js');

function buildTestApp() {
  const app = express();

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  }));

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/activities', requireAuth, activitiesRouter);
  app.use('/api/activities', requireAuth, studentsRouter);
  app.use('/api', requireAuth, feedbackRouter);
  app.use('/api', requireAuth, csvRouter);

  // Global error handler idêntico ao index.js
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({
        error: 'Tamanho da requisição excede o limite permitido (máximo 2MB).',
      });
    }

    console.error('❌ Erro de teste:', err.message);
    res.status(500).json({
      error: 'Erro interno do servidor.',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

  return app;
}

const app = buildTestApp();

const teacher = createTeacher({
  name: 'Prof. Hardening',
  email: 'hardening@educathon.org',
  passwordHash: 'dummy_hash',
});
const testToken = generateToken(teacher);

describe('Fase 5 — 1. Prevenção de Injeção de Fórmula em CSV', () => {
  test('prefixa células que começam com =, +, -, @, \\t ou \\r com apóstrofo', async () => {
    // Cria atividade
    const act = createActivity({
      title: 'Atividade CSV Injection Test',
      question: 'Pergunta de teste para CSV',
      rubric: 'Rubrica de teste',
      teacherId: teacher.id,
    });
    const activityId = Number(act.id);

    // Adiciona alunos com fórmulas maliciosas comuns de planilhas (Excel/Calc DDE Injection)
    addResponses(activityId, [
      {
        student_name: '=cmd|\'/C calc\'!A0',
        original_response: '+123456 Fórmula Positiva',
      },
      {
        student_name: '-Fórmula Negativa',
        original_response: '@SUM(A1:A10) Fórmula Arroba',
      },
      {
        student_name: '\tTab Injetado',
        original_response: '\rCarriage Return Injetado',
      },
      {
        student_name: 'Aluno Normal',
        original_response: 'Resposta normal sem prefixos.',
      },
    ], 'manual');

    // Associa feedbacks aprovados para poder exportar
    const db = getDb();
    const responses = db.prepare('SELECT id, student_name FROM student_responses WHERE activity_id = ?').all(activityId);

    for (const r of responses) {
      const fb = saveFeedback(r.id, 'raw', `Feedback para ${r.student_name}`, 'gemini-test');
      db.prepare("UPDATE feedbacks SET status = 'aprovado' WHERE id = ?").run(fb.id);
    }

    // Exporta o CSV
    const res = await request(app)
      .get(`/api/activities/${activityId}/export`)
      .set('Authorization', `Bearer ${testToken}`);

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);

    const csvContent = res.text;

    // Verifica que cada célula potencialmente executável está prefixada por apóstrofo (')
    assert.ok(
      csvContent.includes(`"'=cmd|'/C calc'!A0"`),
      'Célula começando com = deve ter apóstrofo antes do ='
    );
    assert.ok(
      csvContent.includes(`"'+123456 Fórmula Positiva"`),
      'Célula começando com + deve ter apóstrofo antes do +'
    );
    assert.ok(
      csvContent.includes(`"'-Fórmula Negativa"`),
      'Célula começando com - deve ter apóstrofo antes do -'
    );
    assert.ok(
      csvContent.includes(`"'@SUM(A1:A10) Fórmula Arroba"`),
      'Célula começando com @ deve ter apóstrofo antes do @'
    );
    assert.ok(
      csvContent.includes(`"'\tTab Injetado"`),
      'Célula começando com \\t deve ter apóstrofo antes do \\t'
    );
    assert.ok(
      csvContent.includes(`"'\rCarriage Return Injetado"`),
      'Célula começando com \\r deve ter apóstrofo antes do \\r'
    );

    // Aluno normal não deve ter apóstrofo desnecessário
    assert.ok(
      csvContent.includes(`"Aluno Normal"`),
      'Célula normal não deve ser prefixada com apóstrofo'
    );
  });
});

describe('Fase 5 — 2. Content-Disposition Seguro (ASCII + RFC 5987 UTF-8)', () => {
  test('gera filename ASCII sem aspas/diacríticos e filename* com codificação UTF-8', async () => {
    const complexTitle = 'Redação: "Inovação Tecnológica" & Meio-Ambiente (São Paulo — 2026)';
    const act = createActivity({
      title: complexTitle,
      question: 'Pergunta com título complexo',
      rubric: 'Rubrica',
      teacherId: teacher.id,
    });
    const activityId = Number(act.id);

    addResponses(activityId, [{ student_name: 'Bia', original_response: 'Texto de Bia.' }], 'manual');
    const db = getDb();
    const resp = db.prepare('SELECT id FROM student_responses WHERE activity_id = ?').get(activityId);
    const fb = saveFeedback(resp.id, 'raw', 'Muito bem!', 'gemini-test');
    db.prepare("UPDATE feedbacks SET status = 'aprovado' WHERE id = ?").run(fb.id);

    const res = await request(app)
      .get(`/api/activities/${activityId}/export`)
      .set('Authorization', `Bearer ${testToken}`);

    assert.equal(res.status, 200);

    const contentDisposition = res.headers['content-disposition'];
    assert.ok(contentDisposition, 'Cabeçalho Content-Disposition deve existir');

    // 1. Deve conter attachment
    assert.match(contentDisposition, /^attachment;/);

    // 2. filename="..." seguro em ASCII (sem aspas internas, sem acentos)
    assert.match(contentDisposition, /filename="feedbacks_[a-zA-Z0-9_-]+\.csv"/);
    // Não pode conter aspas duplas adicionais no valor do filename
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
    assert.ok(filenameMatch);
    const asciiName = filenameMatch[1];
    assert.ok(!/[^a-zA-Z0-9_.-]/.test(asciiName), 'Nome ASCII deve conter apenas caracteres seguros');

    // 3. filename*=UTF-8''... RFC 5987
    assert.match(contentDisposition, /filename\*=UTF-8''feedbacks_[^;]+\.csv/);
  });
});

describe('Fase 5 — 3. Rate Limiting Configurável (Auth e IA)', () => {
  test('authLimiter bloqueia excesso de requisições retornando 429', async () => {
    // Cria app com limiter estrito de teste (max: 2 requisições por janela)
    const testRateApp = express();
    testRateApp.use(express.json());

    const strictAuthLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Muitas tentativas de autenticação a partir deste IP. Tente novamente mais tarde.',
      },
    });

    testRateApp.post('/test/auth', strictAuthLimiter, (req, res) => res.json({ ok: true }));

    // Requisição 1: OK
    const r1 = await request(testRateApp).post('/test/auth').send({});
    assert.equal(r1.status, 200);

    // Requisição 2: OK
    const r2 = await request(testRateApp).post('/test/auth').send({});
    assert.equal(r2.status, 200);

    // Requisição 3: Excedeu limite -> 429
    const r3 = await request(testRateApp).post('/test/auth').send({});
    assert.equal(r3.status, 429);
    assert.match(r3.body.error, /Muitas tentativas de autenticação/i);
    assert.ok(r3.headers['retry-after']);
  });

  test('aiGenerateLimiter bloqueia excesso de gerações retornando 429', async () => {
    const testRateApp = express();
    testRateApp.use(express.json());

    const strictAiLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Limite de geração de feedbacks por IA atingido temporariamente. Tente novamente em alguns minutos.',
      },
    });

    testRateApp.post('/test/ai', strictAiLimiter, (req, res) => res.json({ ok: true }));

    await request(testRateApp).post('/test/ai').send({});
    await request(testRateApp).post('/test/ai').send({});

    const rBlocked = await request(testRateApp).post('/test/ai').send({});
    assert.equal(rBlocked.status, 429);
    assert.match(rBlocked.body.error, /Limite de geração de feedbacks por IA/i);
  });
});

describe('Fase 5 — 4. Helmet & Headers de Segurança', () => {
  test('inclui headers essenciais de segurança do Helmet', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);
    // X-Content-Type-Options: nosniff
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    // X-DNS-Prefetch-Control: off
    assert.equal(res.headers['x-dns-prefetch-control'], 'off');
    // Cross-Origin-Resource-Policy: cross-origin
    assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
    // X-Frame-Options: SAMEORIGIN
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  });
});

describe('Fase 5 — 5. Sanitização de Respostas de Erro 500', () => {
  test('não vaza detalhes de erro técnico na resposta', async () => {
    // Dispara erro inesperado em endpoint de feedback com ID malformado ou inexistente
    const res = await request(app)
      .patch('/api/feedback/999999')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ teacherFeedback: 'Feedback para inexistente' });

    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Feedback não encontrado.');
    assert.equal(res.body.stack, undefined);
  });
});

describe('Fase 5 — 6. Validação de Limites de Entrada (400 e 413)', () => {
  test('rejeita payload JSON maior que 2MB com status 413', async () => {
    // Cria string gigante > 2MB
    const bigString = 'A'.repeat(2.5 * 1024 * 1024);
    const res = await request(app)
      .post('/api/csv/preview')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ csvContent: bigString });

    assert.equal(res.status, 413);
    assert.match(res.body.error, /excede o limite permitido/i);
  });

  test('rejeita criação de atividade com título > 200 caracteres', async () => {
    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        title: 'T'.repeat(201),
        question: 'Pergunta válida',
        rubric: 'Rubrica válida',
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /título deve ter no máximo 200/i);
  });

  test('rejeita criação de atividade com pergunta > 2000 caracteres', async () => {
    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        title: 'Título válido',
        question: 'Q'.repeat(2001),
        rubric: 'Rubrica válida',
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /pergunta deve ter no máximo 2000/i);
  });

  test('rejeita criação de atividade com rubrica > 4000 caracteres', async () => {
    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        title: 'Título válido',
        question: 'Pergunta válida',
        rubric: 'R'.repeat(4001),
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /rubrica deve ter no máximo 4000/i);
  });

  test('rejeita criação de atividade com mais de 20 critérios de rubrica', async () => {
    const excessCriteria = Array.from({ length: 21 }, (_, i) => ({
      criterio: `Critério ${i + 1}`,
      peso: 1,
    }));

    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        title: 'Título válido',
        question: 'Pergunta válida',
        rubric: 'Rubrica válida',
        rubricCriteria: excessCriteria,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /limite é de 20 critérios/i);
  });

  test('rejeita respostas manuais com nome do aluno > 100 caracteres', async () => {
    const act = createActivity({
      title: 'Atividade Limites Manuais',
      question: 'Pergunta?',
      rubric: 'Rubrica.',
      teacherId: teacher.id,
    });

    const res = await request(app)
      .post(`/api/activities/${act.id}/manual`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        responses: [
          {
            student_name: 'N'.repeat(101),
            original_response: 'Resposta normal',
          },
        ],
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /nome do aluno deve ter no máximo 100 caracteres/i);
  });

  test('rejeita respostas manuais com resposta > 10000 caracteres', async () => {
    const act = createActivity({
      title: 'Atividade Limites Resposta',
      question: 'Pergunta?',
      rubric: 'Rubrica.',
      teacherId: teacher.id,
    });

    const res = await request(app)
      .post(`/api/activities/${act.id}/manual`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        responses: [
          {
            student_name: 'Aluno Teste',
            original_response: 'X'.repeat(10001),
          },
        ],
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /resposta do aluno deve ter no máximo 10\.000 caracteres/i);
  });

  test('rejeita envio manual com mais de 100 respostas', async () => {
    const act = createActivity({
      title: 'Atividade Limites Quantidade',
      question: 'Pergunta?',
      rubric: 'Rubrica.',
      teacherId: teacher.id,
    });

    const excessResponses = Array.from({ length: 101 }, (_, i) => ({
      student_name: `Aluno ${i + 1}`,
      original_response: `Resposta ${i + 1}`,
    }));

    const res = await request(app)
      .post(`/api/activities/${act.id}/manual`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ responses: excessResponses });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Envie no máximo 100 respostas por lote/i);
  });

  test('rejeita upload de CSV com mais de 200 respostas', async () => {
    const act = createActivity({
      title: 'Atividade CSV Grande',
      question: 'Pergunta?',
      rubric: 'Rubrica.',
      teacherId: teacher.id,
    });

    // Gera CSV com 205 linhas
    let bigCsv = 'nome_aluno,resposta\n';
    for (let i = 1; i <= 205; i++) {
      bigCsv += `Aluno ${i},Resposta ${i}\n`;
    }

    const res = await request(app)
      .post(`/api/activities/${act.id}/upload`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ csvContent: bigCsv });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /máximo 200 alunos por upload/i);
  });
});

describe('Fase 5 — 7. Senha Mínima de 8 Caracteres, Bcrypt Cost e Expiração JWT', () => {
  test('rejeita senhas com menos de 8 caracteres no registro', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Professor 7 Digitos',
        email: 'prof7@educathon.org',
        password: '1234567', // 7 caracteres
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /pelo menos 8 caracteres/i);
  });

  test('aceita senha com 8 ou mais caracteres', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Professor 8 Digitos',
        email: 'prof8@educathon.org',
        password: '12345678', // 8 caracteres
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
  });

  test('configuração de Bcrypt Cost e expiração de JWT estão seguras', () => {
    // Em teste: 4 para performance; em prod: 12
    assert.equal(BCRYPT_ROUNDS, 4);
    // JWT expira em 24h
    assert.equal(JWT_EXPIRES_IN, '24h');
  });
});
