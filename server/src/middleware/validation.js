/**
 * Middleware e Schemas de validação de dados com Zod (Fase 5 — Endurecimento)
 */
import { z } from 'zod';

/**
 * Middleware genérico para validação de corpo de requisições.
 * Retorna 400 com mensagem clara em português quando a validação falhar.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message || 'Dados de entrada inválidos.',
        details: result.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'O nome é obrigatório.' })
    .trim()
    .min(2, 'O nome deve ter no mínimo 2 caracteres.')
    .max(100, 'O nome deve ter no máximo 100 caracteres.'),
  email: z
    .string({ required_error: 'O e-mail é obrigatório.' })
    .trim()
    .email('Forneça um e-mail válido.')
    .max(100, 'O e-mail deve ter no máximo 100 caracteres.'),
  password: z
    .string({ required_error: 'A senha é obrigatória.' })
    .min(8, 'A senha deve ter pelo menos 8 caracteres.')
    .max(100, 'A senha deve ter no máximo 100 caracteres.'),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'E-mail e senha são obrigatórios.' })
    .trim()
    .email('Forneça um e-mail válido.'),
  password: z
    .string({ required_error: 'E-mail e senha são obrigatórios.' })
    .min(1, 'E-mail e senha são obrigatórios.'),
});

export const createActivitySchema = z.object({
  title: z
    .string({ required_error: 'O título é obrigatório.' })
    .trim()
    .min(3, 'O título deve ter no mínimo 3 caracteres.')
    .max(200, 'O título deve ter no máximo 200 caracteres.'),
  question: z
    .string({ required_error: 'A pergunta é obrigatória.' })
    .trim()
    .min(5, 'A pergunta deve ter no mínimo 5 caracteres.')
    .max(2000, 'A pergunta deve ter no máximo 2000 caracteres.'),
  rubric: z
    .string({ required_error: 'A rubrica é obrigatória.' })
    .trim()
    .min(5, 'A rubrica deve ter no mínimo 5 caracteres.')
    .max(4000, 'A rubrica deve ter no máximo 4000 caracteres.'),
  educationLevel: z
    .enum(['fundamental', 'medio', 'superior'], {
      errorMap: () => ({ message: 'Nível de ensino inválido.' }),
    })
    .optional()
    .default('medio'),
  subject: z
    .string()
    .trim()
    .max(100, 'A matéria/disciplina deve ter no máximo 100 caracteres.')
    .optional()
    .nullable(),
  classId: z.union([z.number().int().positive(), z.null()]).optional(),
  dueDate: z.string().optional().nullable(),
  rubricCriteria: z
    .array(
      z.object({
        criterio: z
          .string()
          .trim()
          .min(1, 'O nome do critério não pode ser vazio.')
          .max(200, 'O critério deve ter no máximo 200 caracteres.'),
        peso: z.number().positive('O peso deve ser um número positivo maior que zero.'),
      })
    )
    .max(20, 'O limite é de 20 critérios por atividade.')
    .optional()
    .nullable(),
});

export const manualResponsesSchema = z.object({
  responses: z
    .array(
      z.object({
        student_name: z
          .string({ required_error: 'O nome do aluno é obrigatório.' })
          .trim()
          .min(1, 'O nome do aluno não pode ser vazio.')
          .max(100, 'O nome do aluno deve ter no máximo 100 caracteres.'),
        original_response: z
          .string({ required_error: 'A resposta do aluno é obrigatória.' })
          .trim()
          .min(1, 'A resposta do aluno não pode ser vazia.')
          .max(10000, 'A resposta do aluno deve ter no máximo 10000 caracteres.'),
        student_id: z.number().int().positive().optional().nullable(),
        email: z.string().email().optional().nullable(),
      })
    )
    .min(1, 'Envie pelo menos uma resposta de aluno.')
    .max(100, 'Envie no máximo 100 respostas por lote.'),
});

export const csvContentSchema = z.object({
  csvContent: z
    .string({ required_error: 'Envie o campo "csvContent" com o conteúdo do CSV.' })
    .min(1, 'O conteúdo do arquivo CSV não pode estar vazio.')
    .max(2 * 1024 * 1024, 'O arquivo CSV não pode exceder 2MB.'),
});

export const updateFeedbackSchema = z
  .object({
    teacherFeedback: z
      .string()
      .max(10000, 'O feedback do professor deve ter no máximo 10000 caracteres.')
      .optional(),
    teacherRating: z
      .union([z.literal(-1), z.literal(0), z.literal(1)])
      .optional()
      .nullable(),
    criteriaScores: z
      .array(
        z.object({
          criterio: z.string().max(200),
          atendido: z.boolean(),
          evidencia: z.string().max(1000).optional(),
        })
      )
      .optional()
      .nullable(),
  })
  .refine(
    (data) =>
      data.teacherFeedback !== undefined ||
      data.teacherRating !== undefined ||
      data.criteriaScores !== undefined,
    {
      message:
        'Envie ao menos um campo para atualizar (teacherFeedback, teacherRating ou criteriaScores).',
    }
  );
