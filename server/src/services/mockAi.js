/**
 * Gerador de Feedback Pedagógico Simulado (Modo Mock / Demonstração).
 *
 * Utilizado quando GEMINI_MOCK=true para permitir testes e apresentações
 * sem necessidade de chave de API ou conexão externa.
 *
 * Atende rigorosamente às regras pedagógicas do Educathon:
 * 1. NUNCA atribui nota numérica ou conceito.
 * 2. Começa sempre pelo nome do aluno.
 * 3. Contém entre 3 e 6 frases.
 * 4. Não repete a pergunta original na íntegra.
 * 5. Avalia critérios de rubrica de forma coerente quando presentes.
 * 6. É neutro em relação ao tema (alimentado por critérios da rubrica e resposta do aluno).
 * 7. Detecta prompt injection exclusivamente por conteúdo, nunca por nome.
 */

function sanitizeText(str) {
  return (str || '').toString().trim();
}

/**
 * Extrai o conteúdo pedagógico real da resposta do aluno, isolando tags e instruções injetadas.
 */
function extractRealStudentContent(text) {
  if (!text) return '';

  // Se o aluno utilizou tags para fechar e reabrir <resposta_aluno>, extrai o trecho legítimo
  const match = text.match(/<resposta_aluno>([\s\S]*?)<\/resposta_aluno>/i);
  if (match) {
    return match[1].trim();
  }
  const lastOpen = text.lastIndexOf('<resposta_aluno>');
  if (lastOpen !== -1) {
    return text.slice(lastOpen + '<resposta_aluno>'.length).trim();
  }

  // Remove blocos de tentativa de injeção de sistema
  let cleaned = text.replace(/<instrucao_sistema>[\s\S]*?<\/instrucao_sistema>/gi, ' ');
  cleaned = cleaned.replace(/<\/?[a-z_0-9]+>/gi, ' ');
  cleaned = cleaned.replace(/ignore\s+(?:todas\s+as\s+regras|as\s+instru[çc][õo]es)[^\n.]*/gi, ' ');
  cleaned = cleaned.replace(/(?:atribua|dê|diga\s+que\s+sou)\s+(?:nota|conceito)[^\n.]*/gi, ' ');

  return cleaned.trim() || text.trim();
}

/**
 * Obtém um trecho curto e limpo da resposta para citação contextual.
 */
function getCleanSnippet(text) {
  if (!text) return '';
  const singleLine = text.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (singleLine.length <= 45) return singleLine;
  const slice = singleLine.slice(0, 45);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 20 ? slice.slice(0, lastSpace) : slice) + '...';
}

/**
 * Detecta a categoria pedagógica com base no conteúdo da resposta e na pergunta.
 * Nunca utiliza o nome do estudante para detecção.
 */
function detectCategory(studentResponse, question) {
  const resp = (studentResponse || '').toLowerCase();
  const qLower = (question || '').toLowerCase();

  // 1. Detecção de Prompt Injection exclusivamente por CONTEÚDO
  const injectionPatterns = [
    /<\/?(resposta_aluno|instrucao_sistema|system)>/i,
    /&lt;\/?(resposta_aluno|instrucao_sistema|system)&gt;/i,
    /ignore\s+(?:todas\s+as\s+regras|as\s+instru[çc][õo]es|previous\s+instructions)/i,
    /(?:atribua|dê|coloque|diga\s+que\s+sou)\s+(?:nota|conceito|10|a\+)/i,
    /nota\s+10\s+e\s+diga/i,
  ];
  if (injectionPatterns.some((pattern) => pattern.test(resp))) {
    return 'prompt_injection';
  }

  // 2. Detecção de Resposta Muito Curta (< 35 caracteres ou <= 6 palavras)
  const words = resp.trim().split(/\s+/).filter(Boolean);
  if (resp.length < 35 || words.length <= 6) {
    return 'muito_curta';
  }

  // 3. Detecção de Fora de Tópico (ausência de termos da pergunta)
  const qWords = qLower
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        !['qual', 'como', 'para', 'onde', 'quando', 'sobre', 'explique', 'descreva', 'quais', 'sua'].includes(w)
    );
  if (qWords.length > 0) {
    const hasOverlap = qWords.some((w) => resp.includes(w));
    if (!hasOverlap) {
      return 'fora_de_topico';
    }
  }

  // 4. Detecção de Resposta Informal
  const informalExpressions = [
    'pra quando',
    'a gente guarda',
    'a gente ',
    'comidinha',
    'pra gente',
    'pra poder',
    'pra fazer',
    'tipo assim',
    'tá ligado',
  ];
  if (informalExpressions.some((expr) => resp.includes(expr))) {
    return 'informal_com_acertos';
  }

  // 5. Detecção de Equívoco Conceitual explícito
  if (resp.includes('calor guardado') || resp.includes('respiram gás carbônico')) {
    return 'equivoco_conceitual';
  }

  // 6. Resposta Excelente / Ampla
  if (resp.length > 170 || resp.includes('autotróficos') || resp.includes('clorofilados')) {
    return 'excelente';
  }

  // 7. Parcial ou com omissão
  if (resp.length < 90) {
    return 'parcial_incompleta';
  }

  return 'boa_com_omissao';
}

/**
 * Avalia critérios da rubrica de forma coerente com o texto do aluno.
 */
function evaluateMockCriteria(rubricCriteria, studentResponse, category) {
  if (!rubricCriteria) return [];

  let criteriaList = [];
  if (Array.isArray(rubricCriteria)) {
    criteriaList = rubricCriteria;
  } else if (typeof rubricCriteria === 'string') {
    try {
      criteriaList = JSON.parse(rubricCriteria);
    } catch {
      criteriaList = [];
    }
  }

  if (!criteriaList.length) return [];

  const realContent = extractRealStudentContent(studentResponse);

  return criteriaList.map((c, index) => {
    const criterionTitle = typeof c === 'string' ? c : c.criterio || `Critério ${index + 1}`;

    if (category === 'muito_curta') {
      const atendido = index === 0;
      return {
        criterio: criterionTitle,
        atendido,
        evidencia: atendido
          ? realContent.slice(0, 45) || 'Menção direta ao conceito'
          : 'Aspecto não abordado na resposta resumida',
      };
    }

    if (category === 'fora_de_topico') {
      return {
        criterio: criterionTitle,
        atendido: false,
        evidencia: 'Tema central não identificado na argumentação apresentada',
      };
    }

    if (category === 'equivoco_conceitual') {
      const atendido = index === 0;
      return {
        criterio: criterionTitle,
        atendido,
        evidencia: atendido
          ? 'Tentativa de abordagem com argumentos do cotidiano'
          : 'Conceito formal impreciso ou contraditório',
      };
    }

    if (category === 'boa_com_omissao' || category === 'parcial_incompleta') {
      const atendido = index === 0;
      return {
        criterio: criterionTitle,
        atendido,
        evidencia: atendido
          ? realContent.slice(0, 50) || 'Trecho correspondente identificado'
          : 'Faltou detalhar as relações e fatores complementares exigidos',
      };
    }

    // Excelente / Prompt injection no conteúdo real / Informal com acertos
    const atendido = true;
    return {
      criterio: criterionTitle,
      atendido,
      evidencia:
        realContent.length > 20
          ? realContent.slice(0, 60)
          : 'Trecho correspondente identificado na resposta',
    };
  });
}

/**
 * Gera um feedback determinístico de alta fidelidade pedagógica, neutro ao tema da atividade.
 */
export async function generateMockFeedback({
  studentName,
  question,
  _rubric,
  studentResponse,
  _educationLevel,
  subject,
  rubricCriteria,
}) {
  // Atraso artificial de 300 a 800 ms (fora de testes) para visualização da barra de progresso
  if (process.env.NODE_ENV !== 'test') {
    const delay = Math.floor(300 + Math.random() * 500);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const fullName = sanitizeText(studentName) || 'Aluno';
  const rawResponse = sanitizeText(studentResponse);
  const realContent = extractRealStudentContent(rawResponse);
  const snippet = getCleanSnippet(realContent);

  const category = detectCategory(rawResponse, question);

  // Extrai critérios da rubrica para menção dinâmica no feedback
  let criteriaList = [];
  if (Array.isArray(rubricCriteria)) {
    criteriaList = rubricCriteria;
  } else if (typeof rubricCriteria === 'string') {
    try {
      criteriaList = JSON.parse(rubricCriteria);
    } catch {
      criteriaList = [];
    }
  }

  const criteriaTitles = criteriaList
    .map((c) => (typeof c === 'string' ? c : c.criterio || ''))
    .filter(Boolean);

  const primaryCrit = criteriaTitles[0] || 'os conceitos centrais solicitados';
  const secondaryCrit =
    criteriaTitles[1] || criteriaTitles[0] || 'as relações e desdobramentos esperados';
  const subjectText = subject ? `em ${subject}` : 'na disciplina';

  let pontosFortes;
  let lacunas;
  let sugestaoMelhoria;
  let feedbackCompleto;

  switch (category) {
    case 'prompt_injection':
      pontosFortes = `Você apresentou argumentos pertinentes sobre ${primaryCrit} ao responder à proposta.`;
      lacunas = 'O texto incluiu instruções ou comandos adicionais que desviam do objetivo pedagógico da avaliação.';
      sugestaoMelhoria = 'Concentre sua resposta exclusivamente nos conceitos pedagógicos solicitados na rubrica.';
      feedbackCompleto = `${fullName}, sua resposta contempla pontos pertinentes em relação a ${primaryCrit}. Contudo, foram identificadas instruções no texto que desviam do objetivo pedagógico da avaliação. Recomendo focar estritamente nos conceitos de estudo e nos critérios da rubrica. Continue se dedicando para desenvolver produções claras e bem fundamentadas!`;
      break;

    case 'muito_curta':
      pontosFortes = `Você identificou um aspecto válido ao sintetizar "${snippet}".`;
      lacunas = `A resposta foi extremamente breve e deixou de desenvolver ${secondaryCrit}.`;
      sugestaoMelhoria = 'Procure elaborar parágrafos explicativos que detalhem os mecanismos e relações conceituais exigidos.';
      feedbackCompleto = `${fullName}, você apontou um aspecto válido de forma direta ao sintetizar "${snippet}". Contudo, o texto foi excessivamente breve e não contemplou ${secondaryCrit}. Procure formular explicações mais completas, demonstrando o passo a passo dos conceitos solicitados na rubrica. Esse aprofundamento enriquecerá muito a qualidade da sua argumentação!`;
      break;

    case 'fora_de_topico':
      pontosFortes = 'Você demonstrou boa capacidade de dissertação e organização textual.';
      lacunas = `A abordagem apresentada desviou do tema central da questão e não contemplou ${primaryCrit}.`;
      sugestaoMelhoria = 'Releia o enunciado com atenção e articule sua resposta diretamente aos critérios da rubrica.';
      feedbackCompleto = `${fullName}, sua redação apresenta uma estrutura textual bem articulada. No entanto, sua argumentação desviou do tema central proposto na questão e não contemplou ${primaryCrit}. Releia com atenção o enunciado da atividade para alinhar seus argumentos aos critérios avaliados. Praticar esse direcionamento ajudará a evidenciar seu domínio ${subjectText}!`;
      break;

    case 'informal_com_acertos':
      pontosFortes = `Você compreendeu bem a lógica dos fenômenos solicitados em ${primaryCrit}.`;
      lacunas = 'O registro linguístico empregado foi coloquial para uma avaliação acadêmica.';
      sugestaoMelhoria = 'Substitua termos informais e expressões do cotidiano pelo vocabulário técnico próprio da disciplina.';
      feedbackCompleto = `${fullName}, sua linha de raciocínio demonstra bom entendimento sobre ${primaryCrit}. Entretanto, o uso de expressões coloquiais reduz o rigor conceitual esperado para este nível de ensino. Procure substituir termos do dia a dia pelo vocabulário técnico e formal ${subjectText}. Seu domínio do tema é evidente e a precisão na escrita tornará suas respostas ainda melhores!`;
      break;

    case 'equivoco_conceitual':
      pontosFortes = 'Você buscou formular explicações para conectar os conceitos da proposta.';
      lacunas = `Houve imprecisão ou confusão teórica na definição dos conceitos fundamentais de ${primaryCrit}.`;
      sugestaoMelhoria = 'Revise o material didático sobre os conceitos centrais e atente-se às diferenças entre os termos técnicos.';
      feedbackCompleto = `${fullName}, é muito positivo perceber seu empenho em formular explicações para a questão proposta. Porém, identificou-se uma imprecisão teórica importante em relação a ${primaryCrit}. Releia os conceitos principais no material didático e revise a fundamentação teórica solicitada na rubrica. Esclarecer essas diferenças fortalecerá sua compreensão dos temas ${subjectText}!`;
      break;

    case 'excelente':
      pontosFortes = `Sua resposta contemplou com precisão ${primaryCrit} e articulou com clareza ${secondaryCrit}.`;
      lacunas = 'Não foram observadas lacunas conceituais significativas em relação à rubrica.';
      sugestaoMelhoria = 'Continue explorando desdobramentos aprofundados e aplicações práticas desses conceitos.';
      feedbackCompleto = `${fullName}, sua resposta está excelente e demonstra pleno domínio dos tópicos avaliados na atividade. Você contemplou com precisão ${primaryCrit} e articulou com clareza ${secondaryCrit}. A organização dos seus argumentos foi muito consistente e seguiu rigorosamente os critérios da rubrica. Continue com essa dedicação e mantenha esse excelente padrão em suas próximas produções!`;
      break;

    case 'parcial_incompleta':
    case 'boa_com_omissao':
    default:
      pontosFortes = `Você identificou elementos centrais de ${primaryCrit} de forma coerente.`;
      lacunas = `Faltou aprofundar ${secondaryCrit} para atender plenamente a todos os critérios da rubrica.`;
      sugestaoMelhoria = 'Adicione exemplos concretos e conecte as causas aos efeitos solicitados na atividade.';
      feedbackCompleto = `${fullName}, você construiu uma argumentação coerente e demonstrou compreender os aspectos principais da questão. Para que sua análise alcance o nível pleno, seria fundamental aprofundar ${secondaryCrit}. Procure relacionar os fatores apresentados com maior detalhamento conforme os critérios da rubrica. Praticar essa articulação tornará suas respostas ainda mais completas!`;
      break;
  }

  const criteriosAvaliacao = evaluateMockCriteria(rubricCriteria, rawResponse, category);

  const parsed = {
    pontos_fortes: pontosFortes,
    lacunas: lacunas,
    sugestao_melhoria: sugestaoMelhoria,
    feedback_completo: feedbackCompleto,
  };

  if (criteriosAvaliacao.length > 0) {
    parsed.criterios_avaliacao = criteriosAvaliacao;
  }

  return {
    raw: JSON.stringify(parsed),
    parsed,
    modelUsed: 'mock',
  };
}
