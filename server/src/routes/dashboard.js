import { Router } from 'express';
import { getDashboardSummary } from '../database/db.js';

const router = Router();

/**
 * GET /api/dashboard/summary
 * Retorna as métricas agregadas, pendências, atividades recentes,
 * prazos e fila de revisão exclusivamente do professor autenticado.
 * Prevenção de IDOR: todos os dados são isolados pelo req.teacher.id.
 */
router.get('/summary', (req, res) => {
  try {
    const summary = getDashboardSummary(req.teacher.id);

    res.json({
      teacher: {
        id: req.teacher.id,
        name: req.teacher.name,
      },
      ...summary,
    });
  } catch (error) {
    console.error('Erro ao buscar resumo do painel:', error);
    res.status(500).json({ error: 'Erro interno ao buscar dados do painel.' });
  }
});

export default router;
