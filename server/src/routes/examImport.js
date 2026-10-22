import { Router, json } from 'express';
import { getClassesByTeacher } from '../database/db.js';
import { readExamDocument, DocumentError, MAX_IMPORT_FILE_BYTES } from '../services/documentReader.js';
import { extractExam } from '../services/examExtractor.js';
import { examImportLimiter } from '../middleware/rateLimit.js';
import { reserveQuota, recordUsage, resolveGeminiKey, QuotaError } from '../services/plans.js';

const router = Router();

// Base64 aumenta o tamanho em ~33%: 14 MB de arquivo viram ~18,7 MB de texto.
const jsonParser = json({ limit: '20mb' });

function parseLargeJson(req, res, next) {
  jsonParser(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({ error: 'O arquivo é maior que o limite de 14 MB.' });
    }
    return res.status(400).json({ error: 'Envio inválido. Tente selecionar o arquivo de novo.' });
  });
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * POST /api/activities/import (montada em index.js)
 * Lê o arquivo de uma prova e devolve rascunhos de atividades para o professor revisar.
 * Nada é salvo no banco nem em disco.
 *
 * Body: { fileName: string, dataBase64: string }
 */
router.post('/', examImportLimiter, parseLargeJson, async (req, res) => {
  const { fileName, dataBase64 } = req.body || {};

  if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
    return res.status(400).json({ error: 'Selecione o arquivo da prova.' });
  }
  const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!BASE64_RE.test(cleanBase64)) {
    return res.status(400).json({ error: 'Não foi possível ler o arquivo enviado.' });
  }
  const safeName = typeof fileName === 'string' ? fileName.slice(0, 255) : 'prova';

  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    return res.status(413).json({ error: 'O arquivo é maior que o limite de 14 MB.' });
  }

  let reserved = false;
  try {
    reserveQuota(req.teacher.id, 'import', 1);
    reserved = true;
    const doc = readExamDocument(buffer);
    const classes = getClassesByTeacher(req.teacher.id);
    const result = await extractExam(doc, {
      fileName: safeName,
      classes,
      apiKey: resolveGeminiKey(req.teacher.id),
    });

    if (result.questions.length === 0) {
      const objectiveNote = result.ignoredObjectiveQuestions > 0
        ? ` Encontramos ${result.ignoredObjectiveQuestions} questão(ões) de verdadeiro/falso ou de ligar colunas, que o Educathon ainda não corrige.`
        : '';
      return res.status(422).json({
        error: `Não encontramos questões dissertativas nem de múltipla escolha neste arquivo.${objectiveNote}`,
      });
    }

    const warnings = [];
    if (doc.truncated) {
      warnings.push('O documento era muito longo e só o começo foi lido. Confira se faltou alguma questão.');
    }

    res.json({
      fileName: safeName,
      sourceType: doc.kind,
      ...result,
      warnings,
    });
  } catch (error) {
    // A leitura não aconteceu: devolve a geração reservada
    if (reserved) recordUsage(req.teacher.id, 'import', -1);
    if (error instanceof QuotaError) {
      return res.status(402).json({ error: error.message, quota: error.status, upgradeUrl: '/planos' });
    }
    if (error instanceof DocumentError) {
      if (error.cause) console.error('Erro na leitura da prova:', error.cause.message || error.cause);
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Erro inesperado ao importar prova:', error);
    res.status(500).json({ error: 'Erro interno ao ler a prova.' });
  }
});

export default router;
