/**
 * Teste de Ponta a Ponta (E2E) — Fluxo Completo Pedagógico no Modo Mock (Etapa F).
 *
 * Simula a jornada completa de um professor no Educathon:
 * 1. Cadastro de conta do professor (POST /api/auth/register)
 * 2. Criação de turma (POST /api/classes)
 * 3. Criação de atividade dissertativa com critérios de rubrica (POST /api/activities)
 * 4. Upload de respostas de alunos via CSV (POST /api/activities/:id/upload)
 * 5. Disparo da geração de feedbacks via IA mock (POST /api/activities/:id/generate)
 * 6. Polling do progresso até a conclusão (GET /api/activities/:id/progress)
 * 7. Consulta dos feedbacks gerados (GET /api/activities/:id) e validação pedagógica
 * 8. Edição do feedback pelo professor com sua voz (PATCH /api/feedback/:feedbackId)
 * 9. Aprovação do feedback revisado (POST /api/feedback/:feedbackId/approve)
 * 10. Exportação do CSV final (GET /api/activities/:id/export) com validação de integridade.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Configurações de ambiente para teste determinístico e seguro
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-super-seguro-e2e-educathon-teste-32chars!';
process.env.GEMINI_MOCK = 'true';
process.env.NODE_ENV = 'test';

// Importa rotas após variáveis de ambiente
const { default: authRouter } = await import('../routes/auth.js');
const { default: classesRouter } = await import('../routes/classes.js');
const { default: activitiesRouter } = await import('../routes/activities.js');
const { default: studentsRouter } = await import('../routes/students.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { default: csvRouter } = await import('../routes/csv.js');
const { requireAuth } = await import('../middleware/auth.js');

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_, res) => {
    res.json({
      status: 'ok',
      aiMode: process.env.GEMINI_MOCK === 'true' ? 'mock' : 'gemini',
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/classes', requireAuth, classesRouter);
  app.use('/api/activities', requireAuth, activitiesRouter);
  app.use('/api/activities', requireAuth, studentsRouter);
  app.use('/api', requireAuth, feedbackRouter);
  app.use('/api', requireAuth, csvRouter);

  return app;
}

const app = buildApp();

describe('E2E — Fluxo Pedagógico Completo (Modo Mock)', () => {
  let authToken;
  let teacherId;
  let classId;
  let activityId;
  let feedbackIdAna;

  test('1. Registra novo professor com sucesso', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Professora Mariana Castro',
        email: 'mariana.castro@escola.educathon.dev',
        password: 'SenhaForte@2026',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.token, 'Deve retornar token JWT');
    assert.ok(res.body.teacher, 'Deve retornar dados do professor');
    assert.equal(res.body.teacher.name, 'Professora Mariana Castro');

    authToken = res.body.token;
    teacherId = res.body.teacher.id;
  });

  test('2. Cria uma nova turma associada à professora', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: '2º Ano A - Ensino Médio',
        schoolYear: '2026',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.class);
    assert.equal(res.body.class.name, '2º Ano A - Ensino Médio');
    assert.equal(res.body.class.teacher_id, teacherId);

    classId = res.body.class.id;
  });

  test('3. Cria uma atividade dissertativa com critérios de rubrica', async () => {
    const rubricCriteria = [
      { criterio: 'Contexto histórico e causas da Revolução Francesa', peso: 2 },
      { criterio: 'Queda da Bastilha e Declaração dos Direitos do Homem', peso: 2 },
      { criterio: 'Clareza argumentativa e vocabulário histórico', peso: 1 },
    ];

    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Revolução Francesa e o Fim do Absolutismo',
        question: 'Explique o significado histórico da Queda da Bastilha e como a Declaração dos Direitos do Homem influenciou a cidadania moderna.',
        rubric: 'O estudante deve apontar a crise do Antigo Regime, a Bastilha como símbolo absolutista e os direitos inalienáveis de igualdade e liberdade.',
        educationLevel: 'medio',
        subject: 'História',
        classId: classId,
        rubricCriteria: rubricCriteria,
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.id, 'Deve retornar o ID da atividade criada');

    activityId = res.body.id;
  });

  test('4. Envia CSV com respostas dos estudantes', async () => {
    const csvContent = [
      'nome_aluno,resposta',
      'Ana Beatriz,"A queda da Bastilha em 1789 simbolizou a derrubada do poder absolutista. Em seguida, a Declaração dos Direitos do Homem e do Cidadão estabeleceu a igualdade perante a lei e a liberdade como direitos naturais fundamentais."',
      'Carlos Eduardo,"A Bastilha foi invadida porque o povo francês passava fome e estava revoltado com os reis absolutistas."',
    ].join('\n');

    const res = await request(app)
      .post(`/api/activities/${activityId}/upload`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ csvContent });

    assert.equal(res.status, 201);
    assert.equal(res.body.count, 2);
    assert.equal(res.body.studentIds.length, 2);
  });

  test('5. Dispara geração de feedbacks em lote via IA mock', async () => {
    const res = await request(app)
      .post(`/api/activities/${activityId}/generate`)
      .set('Authorization', `Bearer ${authToken}`);

    assert.equal(res.status, 202);
    assert.equal(res.body.total, 2);
  });

  test('6. Aguarda a fila de processamento concluir todos os alunos', async () => {
    let completed = false;

    for (let attempt = 0; attempt < 30; attempt++) {
      const res = await request(app)
        .get(`/api/activities/${activityId}/progress`)
        .set('Authorization', `Bearer ${authToken}`);

      assert.equal(res.status, 200);

      if (res.body.status === 'completed' || (res.body.total === 2 && res.body.processed === 2)) {
        completed = true;
        assert.equal(res.body.errors, 0, 'Não deve haver erros no processamento mock');
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.ok(completed, 'O processamento em background deve finalizar com sucesso');
  });

  test('7. Consulta atividade e valida feedbacks gerados no padrão pedagógico', async () => {
    const res = await request(app)
      .get(`/api/activities/${activityId}`)
      .set('Authorization', `Bearer ${authToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.responses.length, 2);

    const anaResponse = res.body.responses.find((r) => r.student_name === 'Ana Beatriz');
    assert.ok(anaResponse, 'Resposta da Ana Beatriz deve existir');
    assert.ok(anaResponse.feedback_id, 'Deve possuir feedback gerado');
    assert.equal(anaResponse.status, 'pendente');

    // Valida regras pedagógicas do feedback gerado
    const feedbackText = anaResponse.ai_feedback_text;
    assert.ok(feedbackText.startsWith('Ana Beatriz'), 'Feedback deve começar com o nome do aluno');
    assert.doesNotMatch(feedbackText, /\b(nota|pontos?)\s*:\s*\d+/i, 'Não pode conter nota numérica');

    // Valida pontuação dos critérios de rubrica
    assert.ok(anaResponse.criteria_scores, 'Deve conter criteria_scores preenchido');
    const parsedCriteria = JSON.parse(anaResponse.criteria_scores);
    assert.equal(parsedCriteria.length, 3, 'Deve conter os 3 critérios avaliados');

    feedbackIdAna = anaResponse.feedback_id;
  });

  test('8. Professora edita o feedback de um aluno com sua voz pedagógica', async () => {
    const customizedFeedback = 'Ana Beatriz, excelente análise histórica! Você demonstrou clareza na relação entre a queda da Bastilha e a conquista dos direitos inalienáveis de liberdade e igualdade.';

    const res = await request(app)
      .patch(`/api/feedback/${feedbackIdAna}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        teacherFeedback: customizedFeedback,
        teacherRating: 1,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'revisado');
  });

  test('9. Professora aprova o feedback revisado', async () => {
    const res = await request(app)
      .post(`/api/feedback/${feedbackIdAna}/approve`)
      .set('Authorization', `Bearer ${authToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'aprovado');
  });

  test('10. Exporta o CSV final e confere cabeçalhos, status aprovado e texto editado', async () => {
    const res = await request(app)
      .get(`/api/activities/${activityId}/export`)
      .set('Authorization', `Bearer ${authToken}`);

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);

    const csvText = res.text;

    // Confere cabeçalho
    assert.ok(csvText.includes('nome_aluno,resposta_original,feedback_final,status'), 'Deve conter cabeçalho padrão');

    // Confere aluno com feedback editado e aprovado
    assert.ok(csvText.includes('Ana Beatriz'), 'Deve conter Ana Beatriz');
    assert.ok(
      csvText.includes('Ana Beatriz, excelente análise histórica!'),
      'Deve conter o feedback customizado da professora'
    );
    assert.ok(csvText.includes('aprovado'), 'Status de Ana Beatriz deve ser aprovado');

    // Confere segundo aluno presente no CSV com status pendente
    assert.ok(csvText.includes('Carlos Eduardo'), 'Deve conter Carlos Eduardo');
    assert.ok(csvText.includes('pendente'), 'Status de Carlos Eduardo deve ser pendente');
  });
});
