import { Router, json } from 'express';
import { getClassesByTeacher } from '../database/db.js';
import { readExamDocument, DocumentError, MAX_IMPORT_FILE_BYTES } from '../services/documentReader.js';
import { extractExam } from '../services/examExtractor.js';
import { examImportLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Base64 aumenta o tamanho em ~33%: 8 MB de arquivo viram ~10,7 MB de texto.
const jsonParser = json({ limit: '12mb' });

function parseLargeJson(req, res, next) {
  jsonParser(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({ error: 'O arquivo é maior que o limite de 8 MB.' });
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
    return res.status(413).json({ error: 'O arquivo é maior que o limite de 8 MB.' });
  }

  try {
    const doc = readExamDocument(buffer);
    const classes = getClassesByTeacher(req.teacher.id);
    const result = await extractExam(doc, { fileName: safeName, classes });

    if (result.questions.length === 0) {
      const objectiveNote = result.ignoredObjectiveQuestions > 0
        ? ` Encontramos ${result.ignoredObjectiveQuestions} questão(ões) de múltipla escolha, que o Educathon não corrige.`
        : '';
      return res.status(422).json({
        error: `Não encontramos questões dissertativas neste arquivo.${objectiveNote}`,
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
    if (error instanceof DocumentError) {
      if (error.cause) console.error('Erro na leitura da prova:', error.cause.message || error.cause);
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Erro inesperado ao importar prova:', error);
    res.status(500).json({ error: 'Erro interno ao ler a prova.' });
  }
});

export default router;
