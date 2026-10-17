import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createActivity, createClass, getClasses } from '../services/api';
import type { Class, ExamImportResult } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconPlus, IconAlertCircle, IconCheckCircle } from '../components/ui/Icons';
import { IconTrash } from '../components/ui/Icons';
import { ExamImportPanel } from '../components/ExamImportPanel';

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
}

interface ImportSummary {
  fileName: string;
  count: number;
  ignored: number;
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
  return { key: newId(), include: true, title: '', question: '', rubric: '', criteria: [] };
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

  // Campos comuns a todas as atividades criadas de uma vez
  const [form, setForm] = useState({
    educationLevel: 'medio',
    subject: '',
    classId: '',
    dueDate: '',
  });

  useEffect(() => {
    getClasses()
      .then(setClasses)
      .catch((err) => console.warn('Erro ao carregar turmas:', err));
  }, []);

  const draft = drafts[active] ?? drafts[0];
  const criteria = draft.criteria;
  const isBatch = drafts.length > 1;
  const includedCount = drafts.filter((d) => d.include).length;

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
      result.questions.map((q) => ({
        key: newId(),
        number: q.number,
        include: true,
        title: q.title,
        question: q.question,
        rubric: q.rubric,
        rubricFromDocument: q.rubricFromDocument,
        criteria: q.criteria.map((c) => ({ id: newId(), criterio: c.criterio, peso: c.peso })),
      }))
    );
    setActive(0);
    setSummary({
      fileName: result.fileName,
      count: result.questions.length,
      ignored: result.ignoredObjectiveQuestions,
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
    if (!d.title.trim() || !d.question.trim() || !d.rubric.trim()) {
      return 'Preencha todos os campos obrigatórios.';
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

    const toCreate = drafts
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

    setLoading(true);
    const createdIds: number[] = [];
    const createdKeys = new Set<string>();
    try {
      for (const { d } of toCreate) {
        const rubricCriteria =
          d.criteria.length > 0
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
        });
        createdIds.push(result.id);
        createdKeys.add(d.key);
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

  const submitLabel = isBatch
    ? includedCount === 1
      ? 'Criar 1 atividade'
      : `Criar ${includedCount} atividades`
    : 'Próximo → Enviar Respostas';

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
              {summary.count > 1 && 'Cada questão vira uma atividade. Revise uma por uma nas abas abaixo.'}
            </p>
            {summary.ignored > 0 && (
              <p>
                {summary.ignored === 1
                  ? '1 questão de múltipla escolha foi ignorada'
                  : `${summary.ignored} questões de múltipla escolha foram ignoradas`}{' '}
                (o Educathon dá feedback só em questões dissertativas).
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
              Pergunta feita aos alunos *
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

          <div className="input-group">
            <label className="input-label" htmlFor="rubric">
              Rubrica / Gabarito *
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
                  Critérios de avaliação da rubrica (opcional)
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
