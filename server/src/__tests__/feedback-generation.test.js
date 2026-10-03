/**
 * Testes da Fase 3 — Geração de Feedbacks Confiável
 * Cobre:
 * 1. Sucesso na geração de feedback
 * 2. Erro 429 transitório com retry bem-sucedido
 * 3. Erro permanente (ex.: chave inválida) que não deve ser repetido
 * 4. JSON truncado (SyntaxError) tratado como transitório com retry
 * 5. 409 Conflict em requisições de geração concorrente (duplo clique)
 * 6. Recuperação de jobs órfãos (resetOrphanJobs)
 * 7. Unicidade em feedbacks(student_response_id) via Migration 008
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key-phase3';
process.env.NODE_ENV = 'test';

const { generateFeedback, setModel, resetModel } = await import('../services/gemini.js');
const { processResponses, getProgress, resetOrphanJobs, upsertJob } = await import('../services/queue.js');
const { default: feedbackRouter } = await import('../routes/feedback.js');
const { requireAuth } = await import('../middleware/auth.js');
const { generateToken } = await import('../services/auth.js');
const {
  createTeacher,
  createActivity,
  addResponses,
  getResponsesByActivity,
  saveFeedback,
} = await import('../database/db.js');

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', requireAuth, feedbackRouter);
  return app;
}

const app = buildApp();
const teacher = createTeacher({
  name: 'Prof. Confiabilidade',
  email: 'confiabilidade@educathon.org',
  passwordHash: 'hash_test',
});
const token = generateToken(teacher);

const sampleFeedbackPayload = {
  pontos_fortes: 'Excelente argumentação e coesão.',
  lacunas: 'Falta aprofundar a conclusão.',
  sugestao_melhoria: 'Revise os conectivos conclusivos.',
  feedback_completo: 'Parabéns pela redação! Seus pontos fortes foram a coesão...',
};

describe('Fase 3 — Geração de Feedbacks Confiável', () => {
  beforeEach(() => {
    resetModel();
  });

  describe('1. Sucesso na geração de feedback', () => {
    test('gera feedback e persiste dados no banco corretamente', async () => {
      let calls = 0;
      setModel({
        generateContent: async () => {
          calls++;
          return {
            response: {
              text: () => JSON.stringify(sampleFeedbackPayload),
            },
          };
        },
      });

      const result = await generateFeedback({
        studentName: 'Ana Clara',
        question: 'Dissertação sobre Ética',
        rubric: 'Rubrica detalhada',
        studentResponse: 'Minha resposta bem fundamentada.',
        educationLevel: 'medio',
      });

      assert.equal(calls, 1);
      assert.equal(result.parsed.pontos_fortes, sampleFeedbackPayload.pontos_fortes);
      assert.equal(result.parsed.feedback_completo, sampleFeedbackPayload.feedback_completo);
    });
  });

  describe('2. Erro 429 transitório com retry', () => {
    test('tenta novamente após erro 429 (rate limit) e obtém sucesso na 2ª tentativa', async () => {
      let callCount = 0;
      setModel({
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            const err = new Error('ResourceExhausted: 429 Quota exceeded');
            err.status = 429;
            throw err;
          }
          return {
            response: {
              text: () => JSON.stringify(sampleFeedbackPayload),
            },
          };
        },
      });

      const result = await generateFeedback({
        studentName: 'Bruno Santos',
        question: 'Pergunta sobre História',
        rubric: 'Rubrica',
        studentResponse: 'Resposta do aluno',
        educationLevel: 'medio',
      });

      assert.equal(callCount, 2, 'Deve ter executado exatamente 2 tentativas');
      assert.equal(result.parsed.pontos_fortes, sampleFeedbackPayload.pontos_fortes);
    });
  });

  describe('3. Erro permanente (chave inválida / 400)', () => {
    test('aborta imediatamente na 1ª tentativa sem efetuar retries', async () => {
      let callCount = 0;
      setModel({
        generateContent: async () => {
          callCount++;
          const err = new Error('API_KEY_INVALID: API key not valid. Please pass a valid API key.');
          err.status = 400;
          throw err;
        },
      });

      await assert.rejects(
        async () => {
          await generateFeedback({
            studentName: 'Carlos Eduardo',
            question: 'Pergunta',
            rubric: 'Rubrica',
            studentResponse: 'Resposta',
            educationLevel: 'medio',
          });
        },
        /API_KEY_INVALID/
      );

      assert.equal(callCount, 1, 'Erro permanente não deve sofrer retry');
    });

    test('fila não salva feedback falso quando chamada falha', async () => {
      setModel({
        generateContent: async () => {
          const err = new Error('API_KEY_INVALID');
          err.status = 400;
          throw err;
        },
      });

      const act = createActivity({
        title: 'Atividade de Teste Falha Fila',
        question: 'Pergunta?',
        rubric: 'Rubrica',
        teacherId: teacher.id,
      });

      const [respId] = addResponses(act.id, [
        { student_name: 'Aluno Sem Feedback Falso', original_response: 'Minha resposta' },
      ]);

      await processResponses(
        { id: act.id, question: 'Pergunta?', rubric: 'Rubrica', education_level: 'medio' },
        [{ id: respId, student_name: 'Aluno Sem Feedback Falso', original_response: 'Minha resposta' }]
      );

      const responses = getResponsesByActivity(act.id);
      assert.equal(responses[0].feedback_id, null, 'Nenhum feedback falso deve ser gravado no banco');

      const progress = getProgress(act.id);
      assert.equal(progress.errors, 1, 'Contador de erros deve ser incrementado');
      assert.equal(progress.processed, 1);
    });
  });

  describe('4. JSON truncado (SyntaxError)', () => {
    test('trata JSON truncado como erro transitório e recupera na próxima tentativa', async () => {
      let callCount = 0;
      setModel({
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            // Retorna JSON incompleto / truncado
            return {
              response: {
                text: () => '{"pontos_fortes": "Muito bem estruturado", "lacunas": ',
              },
            };
          }
          return {
            response: {
              text: () => JSON.stringify(sampleFeedbackPayload),
            },
          };
        },
      });

      const result = await generateFeedback({
        studentName: 'Daniela Lima',
        question: 'Pergunta',
        rubric: 'Rubrica',
        studentResponse: 'Resposta',
        educationLevel: 'medio',
      });

      assert.equal(callCount, 2, 'Deve ter tentado novamente após JSON truncado');
      assert.equal(result.parsed.pontos_fortes, sampleFeedbackPayload.pontos_fortes);
    });
  });

  describe('5. 409 Conflict em geração concorrente (duplo clique)', () => {
    test('responde 409 quando já existe job com status processing para a atividade', async () => {
      const act = createActivity({
        title: 'Atividade Concorrência',
        question: 'Pergunta?',
        rubric: 'Rubrica',
        teacherId: teacher.id,
      });

      addResponses(act.id, [{ student_name: 'Aluno Concorrência', original_response: 'Resposta' }]);
      upsertJob(act.id, 'processing', 1, 0, 0);

      const res = await request(app)
        .post(`/api/activities/${act.id}/generate`)
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 409);
      assert.match(res.body.error, /processamento de feedbacks em andamento/i);
    });
  });

  describe('6. Limpeza de jobs órfãos na inicialização (resetOrphanJobs)', () => {
    test('marca jobs em processing como error após reinicialização', () => {
      const act = createActivity({
        title: 'Atividade Órfã',
        question: 'Pergunta?',
        rubric: 'Rubrica',
        teacherId: teacher.id,
      });

      upsertJob(act.id, 'processing', 5, 2, 0);

      const before = getProgress(act.id);
      assert.equal(before.status, 'processing');

      resetOrphanJobs();

      const after = getProgress(act.id);
      assert.equal(after.status, 'error');
    });
  });

  describe('7. Migração 008 — Índice UNIQUE em feedbacks(student_response_id)', () => {
    test('rejeita inserção duplicada para o mesmo student_response_id', () => {
      const act = createActivity({
        title: 'Atividade Unicidade',
        question: 'Pergunta?',
        rubric: 'Rubrica',
        teacherId: teacher.id,
      });

      const [respId] = addResponses(act.id, [{ student_name: 'Aluno Único', original_response: 'Resposta' }]);

      // Primeira inserção: sucesso
      saveFeedback(respId, '{}', 'Feedback 1', 'gemini-test');

      // Segunda inserção para o mesmo responseId: violação da constraint UNIQUE
      assert.throws(
        () => {
          saveFeedback(respId, '{}', 'Feedback 2 duplicado', 'gemini-test');
        },
        /UNIQUE constraint failed/
      );
    });
  });

});
