import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createActivity, createClass, getClasses } from '../services/api';
import type { Class, ExamImportResult } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconPlus, IconAlertCircle, IconCheckCircle } from '../components/ui/Icons';
import { IconTrash } from '../components/ui/Icons';
import { ExamImportPanel } from '../components/ExamImportPanel';

interface ExtraQuestionInput {
  id: string;
  question: string;
  rubric: string;
}

interface CriterionInput {
  id: string;
  criterio: string;
  peso: number;
}

/** Uma atividade a criar. Vem vazia (cadastro manual) ou de uma questão lida da prova. */
interface Draft {
  key: string;
  number?: string;
  include: boolean;
  title: string;
  question: string;
  rubric: string;
  criteria: CriterionInput[];
  /** true = rubrica copiada do gabarito da prova; false = sugerida pela IA; undefined = manual */
  rubricFromDocument?: boolean;
  /** Dissertativa (feedback da IA pela rubrica) ou objetiva (correção pelo gabarito) */
  type: QuestionType;
  options: string[];
  correctOption: string;
  /** Perguntas 2, 3... (só dissertativa). A pergunta 1 é question/rubric. */
  extraQuestions: ExtraQuestionInput[];
}

type QuestionType = 'dissertativa' | 'objetiva';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MAX_QUESTIONS = 20;

interface ImportSummary {
  fileName: string;
  count: number;
  objective: number;
  objectiveWithoutKey: number;
  ignored: number;
  examTitle: string;
  classText: string | null;
  classMatched: boolean;
  warnings: string[];
}

const DRAFT_FIELDS = ['title', 'question', 'rubric'] as const;
type DraftField = (typeof DRAFT_FIELDS)[number];

function newId() {
  return String(Date.now() + Math.random());
}

function emptyDraft(): Draft {
  return {
    key: newId(),
    include: true,
    title: '',
    question: '',
    rubric: '',
    criteria: [],
    type: 'dissertativa',
    options: ['', '', '', ''],
    correctOption: '',
    extraQuestions: [],
  };
}

export default function SetupActivity() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft()]);
  const [active, setActive] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [creatingClass, setCreatingClass] = useState(false);
  // Prova importada com várias dissertativas: criar como UMA atividade com várias perguntas
  const [mergeExam, setMergeExam] = useState(false);
  const [mergedTitle, setMergedTitle] = useState('');

  // Campos comuns a todas as atividades criadas de uma vez
  const [form, setForm] = useState({
    educationLevel: 'medio',
    subject: '',
    classId: '',
    dueDate: '',
  });
  // Nota sugerida pela IA (vale para as dissertativas criadas agora). Desligada por padrão.
  const [aiGrade, setAiGrade] = useState(false);

  useEffect(() => {
    getClasses()
      .then(setClasses)
      .catch((err) => console.warn('Erro ao carregar turmas:', err));
  }, []);

  const draft = drafts[active] ?? drafts[0];
  const criteria = draft.criteria;
  const isBatch = drafts.length > 1;
  const includedCount = drafts.filter((d) => d.include).length;
  const mergeEligible = isBatch && drafts.filter((d) => d.include && d.type === 'dissertativa').length >= 2;
  const hasExtra = draft.extraQuestions.length > 0;

  function updateDraft(patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === active ? { ...d, ...patch } : d)));
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    if ((DRAFT_FIELDS as readonly string[]).includes(name)) {
      updateDraft({ [name as DraftField]: value });
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  }

  function handleAddCriterion() {
    updateDraft({ criteria: [...criteria, { id: newId(), criterio: '', peso: 1 }] });
  }

  function handleRemoveCriterion(id: string) {
    updateDraft({ criteria: criteria.filter((c) => c.id !== id) });
  }

  function handleCriterionChange(id: string, field: 'criterio' | 'peso', value: string | number) {
    updateDraft({
      criteria: criteria.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    });
  }

  function setType(type: QuestionType) {
    updateDraft({ type });
  }

  function handleOptionChange(index: number, value: string) {
    updateDraft({ options: draft.options.map((o, i) => (i === index ? value : o)) });
  }

  function handleAddOption() {
    if (draft.options.length >= LETTERS.length) return;
    updateDraft({ options: [...draft.options, ''] });
  }

  function handleRemoveOption(index: number) {
    if (draft.options.length <= 2) return;
    const removedLetter = LETTERS[index];
    const options = draft.options.filter((_, i) => i !== index);
    // Ajusta o gabarito: a letra removida some e as seguintes sobem uma posição
    let correctOption = draft.correctOption;
    if (correctOption === removedLetter) correctOption = '';
    else if (correctOption && LETTERS.indexOf(correctOption) > index) {
      correctOption = LETTERS[LETTERS.indexOf(correctOption) - 1];
    }
    updateDraft({ options, correctOption });
  }

  function handleAddQuestion() {
    if (draft.extraQuestions.length + 1 >= MAX_QUESTIONS) return;
    updateDraft({ extraQuestions: [...draft.extraQuestions, { id: newId(), question: '', rubric: '' }] });
  }

  function handleRemoveQuestion(id: string) {
    updateDraft({ extraQuestions: draft.extraQuestions.filter((q) => q.id !== id) });
  }

  function handleExtraQuestionChange(id: string, field: 'question' | 'rubric', value: string) {
    updateDraft({
      extraQuestions: draft.extraQuestions.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    });
  }

  function toggleInclude(index: number) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, include: !d.include } : d)));
  }

  function handleImported(result: ExamImportResult) {
    setError('');
    // O servidor só sugere turmas do próprio professor
    const suggested = result.suggestedClassId ? String(result.suggestedClassId) : '';

    setForm((prev) => ({
      educationLevel: result.exam.educationLevel || prev.educationLevel,
      subject: result.exam.subject || prev.subject,
      classId: suggested || prev.classId,
      dueDate: result.exam.dueDate || prev.dueDate,
    }));

    setDrafts(
      result.questions.map((q) => {
        const type: QuestionType = q.type === 'objetiva' ? 'objetiva' : 'dissertativa';
        return {
          key: newId(),
          number: q.number,
          include: true,
          title: q.title,
          question: q.question,
          rubric: q.rubric,
          rubricFromDocument: q.rubricFromDocument,
          criteria: q.criteria.map((c) => ({ id: newId(), criterio: c.criterio, peso: c.peso })),
          type,
          options: type === 'objetiva' && q.options?.length ? q.options.map((o) => o.texto) : ['', '', '', ''],
          correctOption: q.correctOption || '',
          extraQuestions: [],
        };
      })
    );
    setActive(0);
    setMergeExam(false);
    setMergedTitle(result.exam.title || result.fileName.replace(/\.[^.]+$/, ''));
    const objectiveQuestions = result.questions.filter((q) => q.type === 'objetiva');
    setSummary({
      fileName: result.fileName,
      count: result.questions.length,
      objective: objectiveQuestions.length,
      objectiveWithoutKey: objectiveQuestions.filter((q) => !q.correctOption).length,
      ignored: result.ignoredObjectiveQuestions,
      examTitle: result.exam.title || result.fileName.replace(/\.[^.]+$/, ''),
      classText: result.exam.classText,
      classMatched: Boolean(suggested),
      warnings: result.warnings || [],
    });
  }

  async function handleCreateDetectedClass() {
    if (!summary?.classText) return;
    setCreatingClass(true);
    setError('');
    try {
      const { class: created } = await createClass({ name: summary.classText });
      setClasses((prev) => [...prev, { ...created, student_count: 0 }]);
      setForm((prev) => ({ ...prev, classId: String(created.id) }));
      setSummary((prev) => (prev ? { ...prev, classMatched: true } : prev));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a turma.');
    } finally {
      setCreatingClass(false);
    }
  }

  function validateDraft(d: Draft): string | null {
    if (d.type === 'objetiva') {
      if (!d.title.trim() || !d.question.trim()) {
        return 'Preencha todos os campos obrigatórios.';
      }
      const filled = d.options.filter((o) => o.trim());
      if (filled.length !== d.options.length) {
        return 'Preencha o texto de todas as alternativas (ou remova as que sobraram).';
      }
      if (filled.length < 2) {
        return 'A questão de múltipla escolha precisa de pelo menos 2 alternativas.';
      }
      if (!d.correctOption) {
        return 'Marque qual alternativa é a correta (gabarito).';
      }
      return null;
    }
    if (!d.title.trim() || !d.question.trim() || !d.rubric.trim()) {
      return 'Preencha todos os campos obrigatórios.';
    }
    for (let i = 0; i < d.extraQuestions.length; i++) {
      const q = d.extraQuestions[i];
      if (!q.question.trim() || !q.rubric.trim()) {
        return `Preencha a pergunta ${i + 2} e a rubrica dela (ou remova a pergunta).`;
      }
    }
    for (let i = 0; i < d.criteria.length; i++) {
      const c = d.criteria[i];
      if (!c.criterio.trim()) {
        return `O critério #${i + 1} precisa ter um nome preenchido.`;
      }
      const pesoNum = Number(c.peso);
      if (isNaN(pesoNum) || pesoNum <= 0) {
        return `O peso do critério "${c.criterio}" deve ser um número positivo maior que zero.`;
      }
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    let toCreate = drafts
      .map((d, index) => ({ d, index }))
      .filter(({ d }) => d.include);

    if (toCreate.length === 0) {
      setError('Marque ao menos uma questão para criar.');
      return;
    }

    for (const { d, index } of toCreate) {
      const problem = validateDraft(d);
      if (problem) {
        setActive(index);
        setError(isBatch ? `Questão ${d.number || index + 1}: ${problem}` : problem);
        return;
      }
    }

    // Junta as dissertativas marcadas numa atividade só (as objetivas continuam separadas)
    const essays = toCreate.filter(({ d }) => d.type === 'dissertativa');
    let mergedKey: string | null = null;
    if (mergeEligible && mergeExam && essays.length >= 2) {
      if (!mergedTitle.trim()) {
        setError('Dê um título para a prova.');
        return;
      }
      const [first, ...rest] = essays.map(({ d }) => d);
      const merged: Draft = {
        ...first,
        key: newId(),
        title: mergedTitle.trim(),
        extraQuestions: rest.flatMap((d) => [
          { id: newId(), question: d.question, rubric: d.rubric },
          ...d.extraQuestions,
        ]),
      };
      if (merged.extraQuestions.length + 1 > MAX_QUESTIONS) {
        setError(`Uma atividade pode ter no máximo ${MAX_QUESTIONS} perguntas. Desmarque algumas questões.`);
        return;
      }
      mergedKey = merged.key;
      const essayKeys = new Set(essays.map(({ d }) => d.key));
      toCreate = [
        { d: merged, index: essays[0].index },
        ...toCreate.filter(({ d }) => !essayKeys.has(d.key)),
      ];
    }

    setLoading(true);
    const createdIds: number[] = [];
    const createdKeys = new Set<string>();
    try {
      for (const { d } of toCreate) {
        const isObjective = d.type === 'objetiva';
        const rubricCriteria =
          !isObjective && d.criteria.length > 0
            ? d.criteria.map((c) => ({ criterio: c.criterio.trim(), peso: Number(c.peso) || 1 }))
            : undefined;

        const result = await createActivity({
          title: d.title.trim(),
          question: d.question.trim(),
          rubric: d.rubric.trim(),
          educationLevel: form.educationLevel,
          subject: form.subject.trim() || undefined,
          classId: form.classId ? Number(form.classId) : undefined,
          dueDate: form.dueDate ? form.dueDate : undefined,
          rubricCriteria,
          ...(!isObjective && aiGrade ? { aiGradeEnabled: true } : {}),
          ...(!isObjective && d.extraQuestions.length > 0
            ? {
                extraQuestions: d.extraQuestions.map((q) => ({
                  question: q.question.trim(),
                  rubric: q.rubric.trim(),
                })),
              }
            : {}),
          ...(isObjective
            ? {
                questionType: 'objetiva' as const,
                options: d.options.map((texto) => ({ texto: texto.trim() })),
                correctOption: d.correctOption,
              }
            : {}),
        });
        createdIds.push(result.id);
        createdKeys.add(d.key);
        // Na prova juntada, as abas das dissertativas viraram uma atividade só
        if (d.key === mergedKey) {
          essays.forEach(({ d: e }) => createdKeys.add(e.key));
        }
      }

      if (createdIds.length === 1) {
        navigate(`/upload/${createdIds[0]}`);
      } else {
        navigate('/activities', {
          state: { notice: `${createdIds.length} atividades criadas a partir da prova. Abra cada uma para enviar as respostas dos alunos.` },
        });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      if (createdIds.length > 0) {
        // Remove as já criadas para não duplicar ao tentar de novo
        setDrafts((prev) => {
          const rest = prev.filter((d) => !createdKeys.has(d.key));
          return rest.length > 0 ? rest : [emptyDraft()];
        });
        setActive(0);
        setError(`${createdIds.length} atividade(s) criada(s). As demais falharam: ${msg}`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const includedEssays = drafts.filter((d) => d.include && d.type === 'dissertativa').length;
  const willCreate = mergeEligible && mergeExam ? includedCount - includedEssays + 1 : includedCount;
  const submitLabel =
    !isBatch || (mergeEligible && mergeExam && willCreate === 1)
      ? 'Próximo → Enviar Respostas'
      : willCreate === 1
        ? 'Criar 1 atividade'
        : `Criar ${willCreate} atividades`;

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">Configurar atividade</h2>
          <p className="page-subtitle">
            Defina a atividade que seus alunos responderam e o que você espera como resposta ideal.
          </p>
        </div>
      </div>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <ExamImportPanel onImported={handleImported} />

        {summary && (
          <div className="exam-import__summary" role="status">
            <p>
              <IconCheckCircle size={16} />{' '}
              <strong>
                {summary.count === 1 ? '1 questão encontrada' : `${summary.count} questões encontradas`}
              </strong>{' '}
              em “{summary.fileName}”.{' '}
              {summary.count > 1 &&
                (mergeEligible && mergeExam
                  ? 'As questões dissertativas viram uma atividade só, com várias perguntas. Revise cada uma nas abas abaixo.'
                  : 'Cada questão vira uma atividade. Revise uma por uma nas abas abaixo.')}
            </p>
            {mergeEligible && (
              <div className="exam-merge">
                <label className="exam-merge__toggle">
                  <input
                    type="checkbox"
                    checked={mergeExam}
                    onChange={(e) => setMergeExam(e.target.checked)}
                    id="merge-exam"
                  />
                  <span>
                    Juntar as {includedEssays} questões dissertativas em <strong>uma prova só</strong> (o aluno
                    responde todas e recebe um feedback por questão)
                  </span>
                </label>
                {mergeExam && (
                  <div className="input-group">
                    <label className="input-label" htmlFor="merged-title">Título da prova *</label>
                    <input
                      id="merged-title"
                      className="input"
                      value={mergedTitle}
                      onChange={(e) => setMergedTitle(e.target.value)}
                      placeholder="Ex: Prova bimestral de Biologia"
                    />
                  </div>
                )}
              </div>
            )}
            {summary.objective > 0 && (
              <p>
                {summary.objective === 1
                  ? '1 questão é de múltipla escolha: o Educathon corrige pelo gabarito e a IA explica os erros.'
                  : `${summary.objective} questões são de múltipla escolha: o Educathon corrige pelo gabarito e a IA explica os erros.`}
                {summary.objectiveWithoutKey > 0 && ' Marque o gabarito das que vieram sem resposta no arquivo.'}
              </p>
            )}
            {summary.ignored > 0 && (
              <p>
                {summary.ignored === 1
                  ? '1 questão de verdadeiro/falso ou de ligar colunas foi ignorada'
                  : `${summary.ignored} questões de verdadeiro/falso ou de ligar colunas foram ignoradas`}{' '}
                (esses formatos ainda não são corrigidos).
              </p>
            )}
            {summary.classText && summary.classMatched && (
              <p>Turma “{summary.classText}” identificada e selecionada.</p>
            )}
            {summary.classText && !summary.classMatched && (
              <p>
                A prova é da turma “{summary.classText}”, que não está entre as suas turmas.{' '}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={creatingClass}
                  onClick={handleCreateDetectedClass}
                  id="btn-create-detected-class"
                >
                  Criar turma “{summary.classText}”
                </Button>
              </p>
            )}
            {summary.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <form onSubmit={handleSubmit} className="form-grid" noValidate>
          <div className="form-row">
            <div className="input-group">
              <label className="input-label" htmlFor="educationLevel">
                Nível de Ensino
              </label>
              <select
                id="educationLevel"
                name="educationLevel"
                className="select"
                value={form.educationLevel}
                onChange={handleChange}
              >
                <option value="fundamental">Ensino Fundamental</option>
                <option value="medio">Ensino Médio</option>
                <option value="superior">Ensino Superior</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="subject">
                Disciplina / Matéria
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                className="input"
                placeholder="Ex: Biologia, História..."
                value={form.subject}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="input-group">
              <label className="input-label" htmlFor="classId">
                Turma (opcional)
              </label>
              <select
                id="classId"
                name="classId"
                className="select"
                value={form.classId}
                onChange={handleChange}
              >
                <option value="">Nenhuma turma específica (avulsa)</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.student_count || 0} alunos)
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="dueDate">
                Prazo de Entrega (opcional)
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="input"
                value={form.dueDate}
                onChange={handleChange}
              />
            </div>
          </div>

          {isBatch && (
            <div className="question-tabs" role="tablist" aria-label="Questões da prova">
              {drafts.map((d, i) => (
                <div
                  key={d.key}
                  className={`question-tab${i === active ? ' question-tab--active' : ''}${d.include ? '' : ' question-tab--off'}`}
                >
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={() => toggleInclude(i)}
                    aria-label={`Criar atividade da questão ${d.number || i + 1}`}
                  />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={i === active}
                    onClick={() => setActive(i)}
                  >
                    Questão {d.number || i + 1}
                  </button>
                </div>
              ))}
            </div>
          )}

          {isBatch && !draft.include && (
            <p className="input-hint">Esta questão está desmarcada e não será criada.</p>
          )}

          <fieldset className="qtype" aria-describedby="qtype-hint">
            <legend className="input-label">Tipo de questão</legend>
            <div className="qtype__options" role="radiogroup">
              <label className={`qtype__option${draft.type === 'dissertativa' ? ' qtype__option--on' : ''}`}>
                <input
                  type="radio"
                  name={`qtype-${draft.key}`}
                  checked={draft.type === 'dissertativa'}
                  onChange={() => setType('dissertativa')}
                />
                <span>
                  <strong>Dissertativa</strong>
                  <small>A IA compara com a rubrica e escreve o rascunho do feedback.</small>
                </span>
              </label>
              <label className={`qtype__option${draft.type === 'objetiva' ? ' qtype__option--on' : ''}`}>
                <input
                  type="radio"
                  name={`qtype-${draft.key}`}
                  checked={draft.type === 'objetiva'}
                  onChange={() => setType('objetiva')}
                />
                <span>
                  <strong>Múltipla escolha</strong>
                  <small>Corrige pelo gabarito; a IA só explica as respostas erradas.</small>
                </span>
              </label>
            </div>
            <p className="input-hint" id="qtype-hint">Quem lança a nota é sempre você, na revisão.</p>
          </fieldset>

          {draft.type === 'dissertativa' && (
            <label className={`ai-grade-toggle${aiGrade ? ' ai-grade-toggle--on' : ''}`}>
              <input
                type="checkbox"
                checked={aiGrade}
                onChange={(e) => setAiGrade(e.target.checked)}
                id="ai-grade-enabled"
              />
              <span>
                <strong>Deixar a IA sugerir uma nota (0 a 10)</strong>
                <small>
                  A sugestão vem com uma justificativa e aparece só para você na revisão. O aluno só vê a nota que você
                  confirmar ou ajustar.
                </small>
              </span>
            </label>
          )}

          <div className="input-group">
            <label className="input-label" htmlFor="title">
              Título da Atividade *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              className="input"
              placeholder="Ex: Prova de Ciências — Fotossíntese"
              value={draft.title}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="question">
              {hasExtra ? 'Pergunta 1 *' : 'Pergunta feita aos alunos *'}
            </label>
            <p className="input-hint">
              Escreva exatamente a pergunta ou enunciado que os alunos responderam.
            </p>
            <textarea
              id="question"
              name="question"
              className="textarea"
              placeholder="Ex: Explique o processo de fotossíntese e sua importância para os seres vivos."
              value={draft.question}
              onChange={handleChange}
              rows={3}
              required
            />
          </div>

          {draft.type === 'objetiva' ? (
            <>
              <fieldset className="options-editor">
                <legend className="input-label">Alternativas e gabarito *</legend>
                <p className="input-hint">Escreva as alternativas e marque a correta. O aluno pode responder só com a letra.</p>
                {draft.rubricFromDocument === false && !draft.correctOption && (
                  <p className="exam-import__notice">A prova não trazia o gabarito desta questão. Marque a alternativa correta.</p>
                )}
                {draft.options.map((opt, i) => (
                  <div key={i} className="options-editor__row">
                    <label className="options-editor__correct" title={`Alternativa ${LETTERS[i]} é a correta`}>
                      <input
                        type="radio"
                        name={`correct-${draft.key}`}
                        checked={draft.correctOption === LETTERS[i]}
                        onChange={() => updateDraft({ correctOption: LETTERS[i] })}
                        aria-label={`Alternativa ${LETTERS[i]} é a correta`}
                      />
                      <span aria-hidden="true">{LETTERS[i]}</span>
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={opt}
                      placeholder={`Texto da alternativa ${LETTERS[i]}`}
                      onChange={(e) => handleOptionChange(i, e.target.value)}
                      aria-label={`Texto da alternativa ${LETTERS[i]}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveOption(i)}
                      disabled={draft.options.length <= 2}
                      aria-label={`Remover alternativa ${LETTERS[i]}`}
                      title="Remover alternativa"
                    >
                      <IconTrash size={16} />
                    </Button>
                  </div>
                ))}
                {draft.options.length < LETTERS.length && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleAddOption} icon={<IconPlus size={16} />}>
                    Adicionar alternativa
                  </Button>
                )}
              </fieldset>

              <div className="input-group">
                <label className="input-label" htmlFor="rubric">
                  Justificativa do gabarito (opcional)
                </label>
                <p className="input-hint">
                  Por que a alternativa correta está certa. A IA usa isso para explicar o erro a quem marcou outra.
                </p>
                <textarea
                  id="rubric"
                  name="rubric"
                  className="textarea"
                  placeholder="Ex: O cloroplasto contém clorofila e é onde a luz vira energia química."
                  value={draft.rubric}
                  onChange={handleChange}
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
          <div className="input-group">
            <label className="input-label" htmlFor="rubric">
              {hasExtra ? 'Rubrica / Gabarito da pergunta 1 *' : 'Rubrica / Gabarito *'}
            </label>
            <p className="input-hint">
              Descreva o que uma boa resposta deve conter. A IA usará isso para avaliar as respostas.
            </p>
            {draft.rubricFromDocument === false && draft.rubric && (
              <p className="exam-import__notice">
                A prova não tinha gabarito para esta questão: esta rubrica foi sugerida pela IA. Revise antes de criar.
              </p>
            )}
            {draft.rubricFromDocument === false && !draft.rubric && (
              <p className="exam-import__notice">
                A prova não tinha gabarito para esta questão. Escreva a resposta esperada.
              </p>
            )}
            <textarea
              id="rubric"
              name="rubric"
              className="textarea"
              placeholder="Ex: O aluno deve mencionar: luz solar como fonte de energia, absorção de CO2, uso de água (H2O), produção de glicose e liberação de oxigênio. Deve também explicar a importância para a cadeia alimentar."
              value={draft.rubric}
              onChange={handleChange}
              rows={5}
              required
            />
          </div>

          <div className="input-group">
            <div className="page-header-row" style={{ marginBottom: 'var(--space-2)' }}>
              <div>
                <label className="input-label">
                  {hasExtra ? 'Critérios da pergunta 1 (opcional)' : 'Critérios de avaliação da rubrica (opcional)'}
                </label>
                <p className="input-hint">
                  A IA avaliará individualmente cada critério (atendido/não atendido + evidência). O peso serve apenas para priorizar o feedback.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddCriterion}
                id="btn-add-criterion"
                icon={<IconPlus size={16} />}
              >
                + Adicionar Critério
              </Button>
            </div>

            {criteria.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {criteria.map((item, idx) => (
                  <div key={item.id} className="criterion-card">
                    <div>
                      <label className="input-label" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-1)' }}>
                        Critério #{idx + 1} *
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Ex: Explicação do processo biológico"
                        value={item.criterio}
                        onChange={(e) => handleCriterionChange(item.id, 'criterio', e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="input-label" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-1)' }}>
                        Peso (prioridade &gt; 0) *
                      </label>
                      <input
                        type="number"
                        className="input"
                        min="1"
                        step="1"
                        value={item.peso}
                        onChange={(e) => handleCriterionChange(item.id, 'peso', Number(e.target.value))}
                        required
                      />
                    </div>
                    <div style={{ alignSelf: 'flex-end', paddingBottom: '2px' }}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveCriterion(item.id)}
                        title="Remover critério"
                        aria-label="Remover critério"
                        style={{ color: 'var(--error-500)' }}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {draft.extraQuestions.map((q, idx) => {
            const n = idx + 2;
            return (
              <fieldset key={q.id} className="extra-question">
                <div className="extra-question__head">
                  <legend className="extra-question__title">Pergunta {n}</legend>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveQuestion(q.id)}
                    aria-label={`Remover pergunta ${n}`}
                    title="Remover pergunta"
                    style={{ color: 'var(--error-500)' }}
                  >
                    <IconTrash size={16} /> Remover
                  </Button>
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor={`extra-q-${q.id}`}>Pergunta {n} *</label>
                  <textarea
                    id={`extra-q-${q.id}`}
                    className="textarea"
                    rows={3}
                    value={q.question}
                    placeholder="Ex: Qual o papel dos decompositores no ecossistema?"
                    onChange={(e) => handleExtraQuestionChange(q.id, 'question', e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor={`extra-r-${q.id}`}>Rubrica / Gabarito da pergunta {n} *</label>
                  <textarea
                    id={`extra-r-${q.id}`}
                    className="textarea"
                    rows={3}
                    value={q.rubric}
                    placeholder="O que uma boa resposta para esta pergunta deve conter."
                    onChange={(e) => handleExtraQuestionChange(q.id, 'rubric', e.target.value)}
                  />
                </div>
              </fieldset>
            );
          })}

          <div className="extra-question__add">
            <Button
              type="button"
              variant="ghost"
              onClick={handleAddQuestion}
              disabled={draft.extraQuestions.length + 1 >= MAX_QUESTIONS}
              icon={<IconPlus size={16} />}
              id="btn-add-question"
            >
              Adicionar outra pergunta dissertativa
            </Button>
            <p className="input-hint">
              {hasExtra
                ? `${draft.extraQuestions.length + 1} perguntas. A IA escreve um rascunho de feedback para cada uma; a nota final é sua.`
                : 'Sua prova tem mais de uma pergunta? Adicione aqui e corrija tudo numa atividade só.'}
            </p>
          </div>

            </>
          )}

          {error && (
            <div className="alert-box alert-box--error" role="alert">
              <IconAlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/')}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              id="btn-create-activity"
            >
              {loading ? 'Criando...' : submitLabel}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
