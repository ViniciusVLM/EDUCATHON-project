import { useState, useRef, useEffect, DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uploadCSV, addManualResponses, previewCSV, getActivity } from '../services/api';
import type { ActivityWithResponses } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { IconAlertCircle } from '../components/ui/Icons';
import { Mascot } from '../components/ui/Mascot';
import { getActivityQuestions } from '../services/questions';
import { AnswerSheetReader, type ScannedStudent } from '../components/AnswerSheetReader';

interface ManualEntry {
  student_name: string;
  original_response: string;
  answers: string[];
}

function emptyEntry(count: number): ManualEntry {
  return { student_name: '', original_response: '', answers: Array.from({ length: count }, () => '') };
}

export default function UploadResponses() {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activity, setActivity] = useState<ActivityWithResponses | null>(null);
  const [mode, setMode] = useState<'csv' | 'manual' | 'scan'>('csv');
  const [scanned, setScanned] = useState<ScannedStudent[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ student_name: string; original_response: string; answers?: string[] }[]>([]);
  const [csvRaw, setCsvRaw] = useState('');

  // Manual mode
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([emptyEntry(1)]);

  // Várias perguntas: uma caixa de resposta por questão
  const questions = activity && activity.question_type !== 'objetiva' ? getActivityQuestions(activity) : [];
  const questionCount = Math.max(questions.length, 1);
  const isMulti = questionCount > 1;

  useEffect(() => {
    // Ajusta as caixas quando a atividade carrega (preserva o que já foi digitado)
    setManualEntries((prev) =>
      prev.map((e) => ({
        ...e,
        answers: Array.from({ length: questionCount }, (_, i) => e.answers[i] ?? ''),
      }))
    );
  }, [questionCount]);

  useEffect(() => {
    if (activityId) {
      getActivity(Number(activityId))
        .then((act) => setActivity(act))
        .catch(() => {
          // Mantém silencioso se falhar
        });
    }
  }, [activityId]);

  async function handleFileRead(file: File) {
    setError('');
    setCsvPreview([]);
    setCsvRaw('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      setCsvRaw(content);
      setLoading(true);
      try {
        const { rows } = await previewCSV(content, questionCount);
        setCsvPreview(rows);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      handleFileRead(file);
    } else {
      setError('Por favor, envie um arquivo .csv');
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
  }

  function addManualRow() {
    setManualEntries((prev) => [...prev, emptyEntry(questionCount)]);
  }

  function updateManualAnswer(index: number, qIndex: number, value: string) {
    setManualEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, answers: entry.answers.map((a, j) => (j === qIndex ? value : a)) } : entry
      )
    );
  }

  function removeManualRow(index: number) {
    setManualEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function updateManualRow(index: number, field: string, value: string) {
    setManualEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);

    try {
      const id = Number(activityId);

      if (mode === 'csv') {
        if (!csvRaw) {
          setError('Faça upload de um arquivo CSV primeiro.');
          setLoading(false);
          return;
        }
        await uploadCSV(id, csvRaw);
      } else if (mode === 'scan') {
        const valid = scanned.filter((s) => s.name.trim() && s.answers.some((a) => a.trim()));
        if (valid.length === 0) {
          setError('Leia ao menos um arquivo com provas respondidas (ou confira se os nomes estão preenchidos).');
          setLoading(false);
          return;
        }
        const payload = valid.map((s) =>
          isMulti
            ? { student_name: s.name.trim().slice(0, 100), answers: s.answers.map((a) => a.trim()) }
            : { student_name: s.name.trim().slice(0, 100), original_response: s.answers[0].trim() }
        );
        // A rota aceita até 100 respostas por envio
        for (let i = 0; i < payload.length; i += 100) {
          await addManualResponses(id, payload.slice(i, i + 100));
        }
      } else {
        if (isMulti) {
          const valid = manualEntries.filter((e) => e.student_name.trim() && e.answers.some((a) => a.trim()));
          if (valid.length === 0) {
            setError('Adicione pelo menos um aluno com nome e uma resposta.');
            setLoading(false);
            return;
          }
          await addManualResponses(
            id,
            valid.map((e) => ({ student_name: e.student_name.trim(), answers: e.answers.map((a) => a.trim()) }))
          );
        } else {
          const valid = manualEntries.filter((e) => e.student_name.trim() && e.original_response.trim());
          if (valid.length === 0) {
            setError('Adicione pelo menos uma resposta válida.');
            setLoading(false);
            return;
          }
          await addManualResponses(
            id,
            valid.map((e) => ({ student_name: e.student_name, original_response: e.original_response }))
          );
        }
      }

      navigate(`/review/${activityId}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">Enviar respostas</h2>
          <p className="page-subtitle">
            Envie as respostas dos alunos por planilha (CSV), digitando ou lendo o PDF e as fotos das provas respondidas.
          </p>
          {activity?.question_type === 'objetiva' && (
            <p className="exam-import__notice">
              Questão de múltipla escolha: a resposta de cada aluno pode ser só a letra marcada (ex.: “B”).
              A correção é feita pelo gabarito; a IA só escreve a explicação para quem errou.
            </p>
          )}
          {isMulti && (
            <p className="exam-import__notice">
              Esta atividade tem {questionCount} perguntas. Envie a resposta de cada questão separada: a IA escreve
              um rascunho de feedback por questão. Pergunta deixada em branco não gasta IA.
            </p>
          )}
        </div>
      </div>

      {activity && (
        <div className="activity-banner">
          <span className="activity-banner__icon"><Mascot variant="head" size={34} /></span>
          <div style={{ flex: 1 }}>
            <div className="activity-banner__title">{activity.title}</div>
            <div className="activity-banner__meta">
              {activity.class_name ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span>
                    Turma: <strong>{activity.class_name}</strong>
                    {activity.class_code && ` (${activity.class_code})`}
                  </span>
                  <Chip variant="green" size="sm">
                    ✓ Vínculo e e-mails automáticos ativos
                  </Chip>
                </div>
              ) : (
                <span>Sem turma vinculada (avulso)</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="filter-tabs" style={{ marginBottom: 'var(--space-6)' }}>
        <button
          className={`filter-tab ${mode === 'csv' ? 'active' : ''}`}
          onClick={() => setMode('csv')}
          type="button"
        >
          Enviar CSV
        </button>
        <button
          className={`filter-tab ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setMode('manual')}
          type="button"
        >
          Digitar manualmente
        </button>
        <button
          className={`filter-tab ${mode === 'scan' ? 'active' : ''}`}
          onClick={() => setMode('scan')}
          type="button"
        >
          Ler PDF ou fotos
        </button>
      </div>

      {mode === 'scan' ? (
        <Card>
          {activity ? (
            <AnswerSheetReader
              activityId={activity.id}
              questions={activity.question_type === 'objetiva' ? [activity.question] : questions.map((q) => q.pergunta)}
              isObjective={activity.question_type === 'objetiva'}
              students={scanned}
              onChange={setScanned}
            />
          ) : (
            <p className="input-hint">Carregando a atividade...</p>
          )}
        </Card>
      ) : mode === 'csv' ? (
        <Card>
          {/* Drop Zone */}
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="dropzone-icon"><Mascot size={70} /></div>
            <div className="dropzone-text">
              {csvPreview.length > 0
                ? `${csvPreview.length} respostas carregadas`
                : 'Arraste um arquivo CSV aqui ou clique para selecionar'}
            </div>
            <div className="dropzone-hint">
              {isMulti ? (
                <>
                  Colunas esperadas: <strong>nome_aluno</strong>,{' '}
                  {Array.from({ length: Math.min(questionCount, 3) }, (_, i) => (
                    <strong key={i}>resposta_{i + 1}{i < Math.min(questionCount, 3) - 1 ? ', ' : ''}</strong>
                  ))}
                  {questionCount > 3 ? ` … resposta_${questionCount}` : ''}
                </>
              ) : (
                <>
                  Colunas esperadas: <strong>nome_aluno</strong>, <strong>resposta</strong>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </div>

          {/* Preview Table */}
          {csvPreview.length > 0 && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <h4 style={{ marginBottom: 'var(--space-4)' }}>Prévia dos dados</h4>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nome do Aluno</th>
                      <th>Resposta (prévia)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="table-cell-strong">{row.student_name}</td>
                        <td>
                          {row.original_response.length > 100
                            ? row.original_response.substring(0, 100) + '...'
                            : row.original_response}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvPreview.length > 10 && (
                <p className="input-hint" style={{ marginTop: 'var(--space-2)' }}>
                  Mostrando 10 de {csvPreview.length} respostas.
                </p>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="form-grid">
            {manualEntries.map((entry, i) => (
              <div key={i} className="criterion-card" style={{ gridTemplateColumns: '1fr', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Aluno {i + 1}</span>
                  {manualEntries.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeManualRow(i)}
                      style={{ color: 'var(--error-500)' }}
                    >
                      Remover
                    </Button>
                  )}
                </div>
                {isMulti ? (
                  <div className="multi-answers">
                    <input
                      className="input"
                      placeholder="Nome do aluno"
                      aria-label={`Nome do aluno ${i + 1}`}
                      value={entry.student_name}
                      onChange={(e) => updateManualRow(i, 'student_name', e.target.value)}
                    />
                    {questions.map((q, qi) => (
                      <div key={qi} className="multi-answers__item">
                        <label className="multi-answers__question" htmlFor={`ans-${i}-${qi}`}>
                          <span className="multi-answers__num">{qi + 1}</span> {q.pergunta}
                        </label>
                        <textarea
                          id={`ans-${i}-${qi}`}
                          className="textarea"
                          placeholder={`Resposta da questão ${qi + 1} (deixe em branco se o aluno não respondeu)`}
                          value={entry.answers[qi] ?? ''}
                          onChange={(e) => updateManualAnswer(i, qi, e.target.value)}
                          rows={2}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                <div className="form-row">
                  <div className="input-group">
                    <input
                      className="input"
                      placeholder="Nome do aluno"
                      value={entry.student_name}
                      onChange={(e) => updateManualRow(i, 'student_name', e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <textarea
                      className="textarea"
                      placeholder="Resposta do aluno"
                      value={entry.original_response}
                      onChange={(e) => updateManualRow(i, 'original_response', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
                )}
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={addManualRow}
              >
                + Adicionar aluno
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div className="alert-box alert-box--error" role="alert" style={{ marginTop: 'var(--space-4)' }}>
          <IconAlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="form-actions" style={{ marginTop: 'var(--space-6)' }}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate('/setup')}
        >
          ← Voltar
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          loading={loading}
          disabled={loading}
          id="btn-submit-responses"
        >
          {loading ? 'Enviando...' : 'Enviar e gerar feedbacks'}
        </Button>
      </div>
    </div>
  );
}
