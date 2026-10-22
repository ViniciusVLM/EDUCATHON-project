import { Router } from 'express';
import { parseCSV } from '../services/parser.js';

const router = Router();

/**
 * POST /api/csv/preview
 * Roda o parseCSV no servidor sem salvar nada.
 * Retorna as linhas parseadas para prévia no frontend.
 *
 * Segurança / IDOR: Esta rota requer autenticação (requireAuth no index.js), o que é suficiente
 * pois o processamento é puramente stateless (em memória) e não acessa nem modifica entidades
 * do banco de dados ou dados de outros professores.
 *
 * Body: { csvContent: string }
 * Response: { rows: [{student_name, original_response}], total: number }
 */
router.post('/csv/preview', (req, res) => {
  const { csvContent } = req.body;
  // Atividades com várias perguntas mandam quantas são, para ler resposta_1, resposta_2...
  const rawCount = Number(req.body.questionCount);
  const questionCount = Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 20 ? rawCount : 1;

  if (!csvContent || typeof csvContent !== 'string') {
    return res.status(400).json({ error: 'csvContent é obrigatório.' });
  }

  if (csvContent.length > 5 * 1024 * 1024) {
    return res.status(413).json({
      error: 'Arquivo CSV excede o limite permitido de 5 MB.',
    });
  }

  try {
    const rows = parseCSV(csvContent, { questionCount });
    if (rows.length > 500) {
      return res.status(400).json({
        error: 'Quantidade de respostas excede o limite permitido (máximo 500 alunos por upload).',
      });
    }
    res.json({ rows, total: rows.length });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

export default router;
