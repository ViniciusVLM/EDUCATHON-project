/**
 * Template de prompt para geração de feedback pedagógico.
 * Usa System Instructions para garantir comportamento consistente.
 */

export const SYSTEM_INSTRUCTION = `Você é um assistente pedagógico especializado em feedback construtivo e individualizado.
Sua tarefa é analisar a resposta de um aluno em relação à rubrica do professor e gerar um rascunho de feedback pedagógico.

REGRAS OBRIGATÓRIAS QUE VOCÊ DEVE SEGUIR:
1. NUNCA atribua nota numérica ou conceito (A, B, C, etc.).
2. SEMPRE comece destacando o que o aluno acertou ou demonstrou saber.
3. Aponte lacunas ESPECÍFICAS em relação à rubrica — diga exatamente o que ficou faltando.
4. Sugira caminhos concretos de melhoria com linguagem encorajadora e acolhedora.
5. Use linguagem acessível ao nível de ensino indicado.
6. O feedback completo deve ter entre 3 e 6 frases.
7. O tom deve ser de um professor que se importa com o aprendizado do aluno.
8. NÃO repita a pergunta original no feedback.
9. Use o nome do aluno no início do feedback para personalizar.`;

/**
 * Gera o prompt do usuário com as variáveis preenchidas.
 */
export function buildUserPrompt({ studentName, question, rubric, studentResponse, educationLevel }) {
  const levelLabels = {
    fundamental: 'Ensino Fundamental',
    medio: 'Ensino Médio',
    superior: 'Ensino Superior',
  };

  const levelLabel = levelLabels[educationLevel] || 'Ensino Médio';

  return `Analise a resposta do aluno abaixo e gere um feedback pedagógico.

CONTEXTO DA ATIVIDADE:
- Nível de ensino: ${levelLabel}
- Pergunta feita: "${question}"
- Rubrica do professor (o que se espera): "${rubric}"

RESPOSTA DO ALUNO:
- Nome: ${studentName}
- Resposta: "${studentResponse}"

Gere o feedback no formato JSON especificado.`;
}

/**
 * Schema para Structured Output do Gemini.
 * Garante que a resposta sempre virá neste formato.
 */
export const FEEDBACK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    pontos_fortes: {
      type: 'STRING',
      description: 'O que o aluno acertou ou demonstrou compreender corretamente. 1-2 frases.',
    },
    lacunas: {
      type: 'STRING',
      description: 'O que ficou faltando na resposta em relação à rubrica. Seja específico. 1-2 frases.',
    },
    sugestao_melhoria: {
      type: 'STRING',
      description: 'Dica construtiva e encorajadora de como o aluno pode melhorar. 1-2 frases.',
    },
    feedback_completo: {
      type: 'STRING',
      description: 'Texto completo do feedback (3-6 frases), começando com o nome do aluno. Tom pedagógico e encorajador. Pronto para o professor revisar.',
    },
  },
  required: ['pontos_fortes', 'lacunas', 'sugestao_melhoria', 'feedback_completo'],
};
