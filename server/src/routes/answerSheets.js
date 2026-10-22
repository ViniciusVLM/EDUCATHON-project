/**
 * POST /api/activities/:id/read-answers (montada em index.js, antes do limite global de JSON)
 * Lê um arquivo com provas respondidas (PDF, foto, Word ou texto) e devolve as respostas de
 * cada aluno para o professor conferir. Nada é salvo: o arquivo é lido e descartado, e as
 * respostas só entram no banco quando o professor confirma (rota /manual).
 *
 * Body: { fileName: string, dataBase64: string }
 */
import { Router, json } from 'express';
import { getActivityIfOwned } from '../database/db.js';
import { readExamDocument, DocumentError, MAX_IMPORT_FILE_BYTES } from '../services/documentReader.js';
import { readAnswerSheets, questionsForReading } from '../services/answerSheetReader.js';
import { answerSheetsLimiter } from '../middleware/rateLimit.js';
import { reserveQuota, recordUsage, resolveGeminiKey, QuotaError } from '../services/plans.js';

const router = Router({ mergeParams: true });
const jsonParser = json({ limit: '20mb' });
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function parseLargeJson(req, res, next) {
  jsonParser(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({ error: 'O arquivo é maior que o limite de 14 MB.' });
    }
    return res.status(400).json({ error: 'Envio inválido. Tente selecionar o arquivo de novo.' });
  });
}

router.post('/', answerSheetsLimiter, parseLargeJson, async (req, res) => {
  const activity = getActivityIfOwned(Number(req.params.id), req.teacher.id);
  if (!activity) {
    return res.status(404).json({ error: 'Atividade não encontrada.' });
  }

  const { fileName, dataBase64 } = req.body || {};
  if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
    return res.status(400).json({ error: 'Selecione o arquivo com as provas respondidas.' });
  }
  const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!BASE64_RE.test(cleanBase64)) {
    return res.status(400).json({ error: 'Não foi possível ler o arquivo enviado.' });
  }
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    return res.status(413).json({ error: 'O arquivo é maior que o limite de 14 MB.' });
  }

  let reserved = false;
  try {
    reserveQuota(req.teacher.id, 'import', 1);
    reserved = true;
    const doc = readExamDocument(buffer);
    const result = await readAnswerSheets(doc, activity, { apiKey: resolveGeminiKey(req.teacher.id) });
    if (result.students.length === 0) {
      recordUsage(req.teacher.id, 'import', -1);
      reserved = false;
      return res.status(422).json({
        error: 'Não encontramos respostas de alunos neste arquivo. Confira se é a prova respondida desta atividade.',
      });
    }
    const questions = questionsForReading(activity);
    res.json({
      fileName: typeof fileName === 'string' ? fileName.slice(0, 255) : 'arquivo',
      questionCount: questions.length,
      questions: questions.map((q) => q.text),
      students: result.students,
      warnings: result.warnings,
    });
  } catch (error) {
    if (reserved) recordUsage(req.teacher.id, 'import', -1);
    if (error instanceof QuotaError) {
      return res.status(402).json({ error: error.message, quota: error.status, upgradeUrl: '/planos' });
    }
    if (error instanceof DocumentError) {
      if (error.cause) console.error('Erro na leitura das provas respondidas:', error.cause.message || error.cause);
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Erro inesperado ao ler provas respondidas:', error);
    res.status(500).json({ error: 'Erro interno ao ler as provas respondidas.' });
  }
});

export default router;
