import { Router } from 'express';
import {
  createClass,
  getClassesByTeacher,
  getClassById,
  updateClass,
  deleteClass,
  createStudent,
  createStudentsBatch,
  deleteStudentFromClass,
} from '../database/db.js';

const router = Router();

/**
 * GET /api/classes
 * Lista todas as turmas do professor logado com contagem de alunos.
 */
router.get('/', (req, res) => {
  try {
    const classes = getClassesByTeacher(req.teacher.id);
    res.json(classes);
  } catch (err) {
    console.error('Erro ao listar turmas:', err);
    res.status(500).json({ error: 'Erro interno ao listar turmas.' });
  }
});

/**
 * POST /api/classes
 * Cria uma nova turma para o professor logado.
 */
router.post('/', (req, res) => {
  try {
    const { name, schoolYear } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'O nome da turma é obrigatório.' });
    }

    const newClass = createClass({
      teacherId: req.teacher.id,
      name: name.trim(),
      schoolYear: schoolYear ? schoolYear.trim() : null,
    });

    res.status(201).json({
      message: 'Turma criada com sucesso!',
      class: newClass,
    });
  } catch (err) {
    console.error('Erro ao criar turma:', err);
    res.status(500).json({ error: 'Erro interno ao criar turma.' });
  }
});

/**
 * GET /api/classes/:id
 * Retorna detalhes da turma e a lista de alunos matriculados.
 */
router.get('/:id', (req, res) => {
  try {
    const classId = Number(req.params.id);
    const cls = getClassById(classId, req.teacher.id);

    if (!cls) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }

    res.json(cls);
  } catch (err) {
    console.error('Erro ao buscar turma:', err);
    res.status(500).json({ error: 'Erro interno ao buscar turma.' });
  }
});

/**
 * PATCH /api/classes/:id
 * Atualiza o nome ou ano letivo da turma.
 */
router.patch('/:id', (req, res) => {
  try {
    const classId = Number(req.params.id);
    const { name, schoolYear } = req.body;

    const cls = getClassById(classId, req.teacher.id);
    if (!cls) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }

    updateClass(classId, req.teacher.id, { name, schoolYear });

    res.json({ message: 'Turma atualizada com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar turma:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar turma.' });
  }
});

/**
 * DELETE /api/classes/:id
 * Remove a turma e desvincula ou remove seus alunos.
 */
router.delete('/:id', (req, res) => {
  try {
    const classId = Number(req.params.id);
    const cls = getClassById(classId, req.teacher.id);

    if (!cls) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }

    deleteClass(classId, req.teacher.id);
    res.json({ message: 'Turma removida com sucesso!' });
  } catch (err) {
    console.error('Erro ao excluir turma:', err);
    res.status(500).json({ error: 'Erro interno ao excluir turma.' });
  }
});

/**
 * POST /api/classes/:id/students
 * Adiciona um ou múltiplos alunos a uma turma.
 * Body: { name, email } ou { students: [{ name, email }] }
 */
router.post('/:id/students', (req, res) => {
  try {
    const classId = Number(req.params.id);
    const cls = getClassById(classId, req.teacher.id);

    if (!cls) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }

    const { name, email, students } = req.body;

    // Inclusão em lote
    if (Array.isArray(students)) {
      if (students.length === 0) {
        return res.status(400).json({ error: 'Array de estudantes vazio.' });
      }
      const created = createStudentsBatch(classId, students);
      return res.status(201).json({
        message: `${created.length} alunos adicionados com sucesso!`,
        count: created.length,
        students: created,
      });
    }

    // Inclusão individual
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
    }

    const student = createStudent({
      classId,
      name: name.trim(),
      email: email ? email.trim() : null,
    });

    res.status(201).json({
      message: 'Aluno adicionado com sucesso!',
      student,
    });
  } catch (err) {
    console.error('Erro ao adicionar aluno:', err);
    res.status(500).json({ error: 'Erro interno ao adicionar aluno.' });
  }
});

/**
 * DELETE /api/classes/:id/students/:studentId
 * Remove um aluno de uma turma.
 */
router.delete('/:id/students/:studentId', (req, res) => {
  try {
    const classId = Number(req.params.id);
    const studentId = Number(req.params.studentId);

    // Verifica que a turma pertence ao professor logado
    const cls = getClassById(classId, req.teacher.id);
    if (!cls) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }

    // IDOR fix: apaga somente se o aluno pertencer à turma já validada
    const result = deleteStudentFromClass(studentId, classId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Aluno não encontrado nesta turma.' });
    }

    res.json({ message: 'Aluno removido com sucesso!' });
  } catch (err) {
    console.error('Erro ao remover aluno:', err);
    res.status(500).json({ error: 'Erro interno ao remover aluno.' });
  }
});

export default router;
