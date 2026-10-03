import { Router } from 'express';
import {
  createActivity,
  getActivity,
  getAllActivities,
  getResponsesByActivity,
  getActivityStats,
  getClassById,
} from '../database/db.js';

const router = Router();

/**
 * POST /api/activities
 * Cria uma nova atividade de correção.
 */
router.post('/', (req, res) => {
  try {
    const { title, question, rubric, educationLevel, subject, classId, dueDate, rubricCriteria } = req.body;

    if (!title || !question || !rubric) {
      return res.status(400).json({
        error: 'Campos obrigatórios: title, question, rubric',
      });
    }

    // IDOR fix: se informado classId, valida se a turma pertence ao professor logado
    if (classId) {
      const cls = getClassById(Number(classId), req.teacher.id);
      if (!cls) {
        return res.status(404).json({ error: 'Turma não encontrada.' });
      }
    }

    const result = createActivity({
      title,
      question,
      rubric,
      educationLevel,
      subject,
      classId,
      dueDate,
      rubricCriteria,
      teacherId: req.teacher.id,
    });

    res.status(201).json({
      message: 'Atividade criada com sucesso!',
      id: Number(result.id),
    });
  } catch (error) {
    console.error('Erro ao criar atividade:', error);
    res.status(500).json({ error: 'Erro interno ao criar atividade.' });
  }
});

/**
 * GET /api/activities
 * Lista todas as atividades do professor logado.
 */
router.get('/', (req, res) => {
  try {
    const activities = getAllActivities(req.teacher.id);
    res.json(activities);
  } catch (error) {
    console.error('Erro ao listar atividades:', error);
    res.status(500).json({ error: 'Erro interno ao listar atividades.' });
  }
});

/**
 * GET /api/activities/:id
 * Retorna uma atividade com todas as respostas e feedbacks.
 */
router.get('/:id', (req, res) => {
  try {
    const activity = getActivity(Number(req.params.id));
    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    const responses = getResponsesByActivity(activity.id);
    const stats = getActivityStats(activity.id);

    res.json({
      ...activity,
      responses,
      stats,
    });
  } catch (error) {
    console.error('Erro ao buscar atividade:', error);
    res.status(500).json({ error: 'Erro interno ao buscar atividade.' });
  }
});

export default router;
