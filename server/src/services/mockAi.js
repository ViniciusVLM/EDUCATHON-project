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
 * 6. Varia o tom e o conteúdo de acordo com o perfil da resposta do aluno.
 */

function sanitizeText(str) {
  return (str || '').toString().trim();
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

  return criteriaList.map((c, index) => {
    const criterionTitle = typeof c === 'string' ? c : c.criterio || `Critério ${index + 1}`;

    if (category === 'muito_curta') {
      const atendido = index === 0;
      return {
        criterio: criterionTitle,
        atendido,
        evidencia: atendido
          ? studentResponse.slice(0, 40)
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
          ? 'Tentativa de explicação com base em exemplos do cotidiano'
          : 'Conceito formal confundido na resposta',
      };
    }

    if (category === 'boa_com_omissao' || category === 'parcial_incompleta') {
      const atendido = index === 0 || index % 2 === 0;
      return {
        criterio: criterionTitle,
        atendido,
        evidencia: atendido
          ? studentResponse.slice(0, 50)
          : 'Faltou detalhar as relações e fatores complementares exigidos',
      };
    }

    // Excelente / Padrão / Prompt injection no texto acadêmico
    const atendido = true;
    return {
      criterio: criterionTitle,
      atendido,
      evidencia: studentResponse.length > 30 ? studentResponse.slice(0, 60) : 'Trecho correspondente identificado',
    };
  });
}

/**
 * Gera um feedback determinístico de alta fidelidade pedagógica.
 */
export async function generateMockFeedback({
  studentName,
  question,
  _rubric,
  studentResponse,
  _educationLevel,
  _subject,
  rubricCriteria,
}) {
  // Atraso artificial de 300 a 800 ms (fora de testes) para visualização da barra de progresso
  if (process.env.NODE_ENV !== 'test') {
    const delay = Math.floor(300 + Math.random() * 500);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const name = sanitizeText(studentName) || 'Aluno';
  const responseText = sanitizeText(studentResponse);
  const responseLower = responseText.toLowerCase();

  let category = 'padrao';

  // 1. Detecção de Prompt Injection
  if (
    responseLower.includes('ignore') ||
    responseLower.includes('instrucao') ||
    responseLower.includes('instrução') ||
    responseLower.includes('system') ||
    responseLower.includes('nota 10') ||
    responseLower.includes('alexandre hacker') ||
    responseLower.includes('&lt;/resposta_aluno&gt;')
  ) {
    category = 'prompt_injection';
  }
  // 2. Detecção de Fora de Tópico
  else if (
    (responseLower.includes('celular') || responseLower.includes('computador') || responseLower.includes('internet')) &&
    (question.toLowerCase().includes('darwin') || question.toLowerCase().includes('seleção natural'))
  ) {
    category = 'fora_de_topico';
  }
  // 3. Detecção de Equívoco Conceitual
  else if (
    responseLower.includes('calor guardado') ||
    (responseLower.includes('febre') && question.toLowerCase().includes('calor'))
  ) {
    category = 'equivoco_conceitual';
  }
  // 4. Detecção de Resposta Muito Curta (< 35 chars ou poucas palavras)
  else if (responseText.length < 35 || responseText.split(/\s+/).length <= 6) {
    category = 'muito_curta';
  }
  // 5. Detecção de Excelente / Completa
  else if (responseText.length > 180 || responseLower.includes('autotróficos') || responseLower.includes('cadeias tróficas')) {
    category = 'excelente';
  }
  // 6. Detecção de Resposta Informal com Acertos
  else if (responseLower.includes('pra quando') || responseLower.includes('a gente guarda') || responseLower.includes('glicogênio')) {
    category = 'informal_com_acertos';
  }
  // 7. Parcial ou com omissão
  else if (responseLower.includes('bastilha') || responseLower.includes('pegam o sol')) {
    category = 'parcial_incompleta';
  }

  let pontosFortes;
  let lacunas;
  let sugestaoMelhoria;
  let feedbackCompleto;

  switch (category) {
    case 'prompt_injection':
      pontosFortes = 'Você identificou adequadamente a centralidade da razão e a crítica ao absolutismo.';
      lacunas = 'Faltou explicitar os direitos naturais inalienáveis, como vida e propriedade.';
      sugestaoMelhoria = 'Pesquise autores como John Locke e Voltaire para fundamentar sua resposta.';
      feedbackCompleto = `${name}, seu texto demonstra compreensão sobre a crítica iluminista ao poder absolutista e a valorização da razão. No entanto, é fundamental destacar também os direitos naturais como a liberdade e a propriedade privada. Continue aprofundando seus estudos relacionando essas ideias às transformações políticas da época!`;
      break;

    case 'muito_curta':
      pontosFortes = 'Você identificou com precisão o transporte de oxigênio pelo sistema circulatório.';
      lacunas = 'Sua resposta foi bastante breve e não mencionou a hemoglobina nem o recolhimento de dióxido de carbono.';
      sugestaoMelhoria = 'Procure detalhar os mecanismos biológicos envolvidos para enriquecer sua explicação.';
      feedbackCompleto = `${name}, sua resposta acertou a função essencial de transporte de oxigênio pelo sangue. Contudo, faltou explicar o papel da hemoglobina e o transporte de gás carbônico conforme solicitado na rubrica. Procure formular parágrafos mais completos demonstrando como essas etapas ocorrem no organismo!`;
      break;

    case 'equivoco_conceitual':
      pontosFortes = 'Você utilizou situações do cotidiano como febre e sensação térmica para ilustrar sua resposta.';
      lacunas = 'Houve confusão ao definir calor como energia guardada e temperatura apenas como medição clínica.';
      sugestaoMelhoria = 'Revise as definições científicas de agitação térmica molecular e de energia em trânsito.';
      feedbackCompleto = `${name}, é muito positivo ver seu esforço em relacionar a física com situações do dia a dia. Porém, lembre-se de que temperatura mede a agitação molecular, enquanto calor é a transferência de energia entre corpos. Releia os conceitos de termologia no material didático e pratique essa diferenciação!`;
      break;

    case 'fora_de_topico':
      pontosFortes = 'Você demonstrou boa capacidade de dissertação ao analisar o impacto da tecnologia e da internet.';
      lacunas = 'O texto abordou comunicação moderna em vez de explicar os mecanismos da seleção natural propostos por Darwin.';
      sugestaoMelhoria = 'Concentre sua análise nos conceitos biológicos de variabilidade genética e reprodução diferencial.';
      feedbackCompleto = `${name}, sua redação apresenta ideias interessantes sobre o impacto das novas tecnologias na sociedade. Entretanto, a questão solicitava especificamente os fundamentos da seleção natural segundo Charles Darwin. Releia atentamente o enunciado da atividade e busque articular os conceitos biológicos solicitados na rubrica!`;
      break;

    case 'excelente':
      pontosFortes = 'Sua resposta descreveu com rigor científico reagentes, produtos e o papel na teia alimentar.';
      lacunas = 'Não foram identificadas omissões significativas em relação aos critérios da rubrica.';
      sugestaoMelhoria = 'Explore como as variações de intensidade luminosa e temperatura interferem na taxa fotossintética.';
      feedbackCompleto = `${name}, sua resposta está excelente e demonstra domínio completo dos processos biológicos e ecológicos envolvidos. Você articulou de forma clara os reagentes e produtos, conectando-os à sustentação dos ecossistemas. Mantenha essa dedicação e continue explorando desdobramentos aprofundados do tema!`;
      break;

    case 'informal_com_acertos':
      pontosFortes = 'Você compreendeu muito bem a glicólise, a produção de ATP e a formação de reservas de glicogênio.';
      lacunas = 'O registro linguístico utilizado foi bastante coloquial para uma avaliação acadêmica.';
      sugestaoMelhoria = 'Substitua termos informais por vocabulário técnico e formal apropriado ao nível de ensino.';
      feedbackCompleto = `${name}, seu raciocínio conceitual está correto ao explicar a transformação de energia e o armazenamento de glicose. Para aprimorar suas produções acadêmicas, procure substituir expressões coloquiais pelos termos formais da disciplina. Seu progresso é evidente e o aprofundamento da escrita formal tornará suas respostas ainda mais sólidas!`;
      break;

    case 'parcial_incompleta':
    case 'boa_com_omissao':
    default: {
      const len = responseText.length;
      if (len > 80) {
        pontosFortes = 'Você construiu uma linha de raciocínio coerente e demonstrou compreensão dos pontos principais.';
        lacunas = 'Algumas causas e desdobramentos previstos na rubrica do professor ficaram sem detalhamento.';
        sugestaoMelhoria = 'Procure conectar as causas socioeconômicas e os efeitos históricos de maneira mais abrangente.';
        feedbackCompleto = `${name}, seu texto apresenta bons argumentos e demonstra que você compreendeu os aspectos centrais da aula. Para alcançar o nível pleno esperado pela rubrica, aprofunde os fatores complementares e seus impactos diretos. Continue praticando essa articulação para consolidar seu aprendizado!`;
      } else {
        pontosFortes = 'Você identificou conceitos relevantes da temática proposta na atividade.';
        lacunas = 'A explicação necessita de maior desenvolvimento e conexão entre os termos abordados.';
        sugestaoMelhoria = 'Releia o texto de apoio e adicione exemplos concretos para sustentar suas conclusões.';
        feedbackCompleto = `${name}, você indicou pontos relevantes ao responder à questão proposta pelo professor. Para que sua análise fique completa, recomendo detalhar melhor as relações conceituais exigidas na rubrica. Pratique elaborar respostas mais completas para demonstrar toda a sua capacidade!`;
      }
      break;
    }
  }

  const criteriosAvaliacao = evaluateMockCriteria(rubricCriteria, studentResponse, category);

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
