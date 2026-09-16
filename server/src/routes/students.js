import { Router } from 'express';
import { parseCSV } from '../services/parser.js';
import { addResponses, getActivityIfOwned } from '../database/db.js';

const router = Router();

/**
 * POST /api/activities/:id/upload
 * Recebe o corpo de um CSV como texto e faz o parse.
 */
router.post('/:id/upload', (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const activity = getActivityIfOwned(activityId, req.teacher.id);

    if (!activity) {
      // 404 para ID inexistente e para atividade de outro professor (prevenção de IDOR)
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    const { csvContent } = req.body;

    if (!csvContent) {
      return res.status(400).json({
        error: 'Envie o campo "csvContent" com o conteúdo do CSV.',
      });
    }

    const parsed = parseCSV(csvContent);
    const ids = addResponses(activityId, parsed, 'csv');

    res.status(201).json({
      message: `${parsed.length} respostas carregadas com sucesso!`,
      count: parsed.length,
      studentIds: ids.map(Number),
    });
  } catch (error) {
    console.error('Erro no upload de CSV:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/activities/:id/manual
 * Recebe respostas manuais em JSON.
 * Body: { responses: [{ student_name: "João", original_response: "..." }] }
 */
router.post('/:id/manual', (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const activity = getActivityIfOwned(activityId, req.teacher.id);

    if (!activity) {
      // 404 para ID inexistente e para atividade de outro professor (prevenção de IDOR)
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    const { responses } = req.body;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({
        error: 'Envie "responses" como array de { student_name, original_response }.',
      });
    }

    // Valida cada resposta
    for (const [i, r] of responses.entries()) {
      if (!r.student_name || !r.original_response) {
        return res.status(400).json({
          error: `Resposta ${i + 1} inválida: campos student_name e original_response são obrigatórios.`,
        });
      }
    }

    const ids = addResponses(activityId, responses, 'manual');

    res.status(201).json({
      message: `${responses.length} respostas adicionadas com sucesso!`,
      count: responses.length,
      studentIds: ids.map(Number),
    });
  } catch (error) {
    console.error('Erro ao adicionar respostas manuais:', error);
    res.status(500).json({ error: 'Erro interno ao adicionar respostas.' });
  }
});

export default router;
