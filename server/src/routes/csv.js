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

  if (!csvContent || typeof csvContent !== 'string') {
    return res.status(400).json({ error: 'csvContent é obrigatório.' });
  }

  try {
    const rows = parseCSV(csvContent);
    res.json({ rows, total: rows.length });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

export default router;
