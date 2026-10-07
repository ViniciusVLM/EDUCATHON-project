import { useState, useRef, useEffect, DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uploadCSV, addManualResponses, previewCSV, getActivity } from '../services/api';
import type { ActivityWithResponses } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { IconAlertCircle } from '../components/ui/Icons';

export default function UploadResponses() {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activity, setActivity] = useState<ActivityWithResponses | null>(null);
  const [mode, setMode] = useState<'csv' | 'manual'>('csv');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ student_name: string; original_response: string }[]>([]);
  const [csvRaw, setCsvRaw] = useState('');

  // Manual mode
  const [manualEntries, setManualEntries] = useState([
    { student_name: '', original_response: '' },
  ]);

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
        const { rows } = await previewCSV(content);
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
    setManualEntries((prev) => [...prev, { student_name: '', original_response: '' }]);
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
      } else {
        const valid = manualEntries.filter((e) => e.student_name.trim() && e.original_response.trim());
        if (valid.length === 0) {
          setError('Adicione pelo menos uma resposta válida.');
          setLoading(false);
          return;
        }
        await addManualResponses(id, valid);
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
          <h2 className="page-title">📤 Enviar Respostas</h2>
          <p className="page-subtitle">
            Envie as respostas dos alunos via arquivo CSV ou digite manualmente.
          </p>
        </div>
      </div>

      {activity && (
        <div className="activity-banner">
          <span className="activity-banner__icon">📋</span>
          <div style={{ flex: 1 }}>
            <div className="activity-banner__title">{activity.title}</div>
            <div className="activity-banner__meta">
              {activity.class_name ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span>
                    🏫 Turma: <strong>{activity.class_name}</strong>
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
          📁 Upload CSV
        </button>
        <button
          className={`filter-tab ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setMode('manual')}
          type="button"
        >
          ✏️ Digitar Manualmente
        </button>
      </div>

      {mode === 'csv' ? (
        <Card>
          {/* Drop Zone */}
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="dropzone-icon">📄</div>
            <div className="dropzone-text">
              {csvPreview.length > 0
                ? `✅ ${csvPreview.length} respostas carregadas`
                : 'Arraste um arquivo CSV aqui ou clique para selecionar'}
            </div>
            <div className="dropzone-hint">
              Colunas esperadas: <strong>nome_aluno</strong>, <strong>resposta</strong>
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
                      🗑️ Remover
                    </Button>
                  )}
                </div>
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
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={addManualRow}
              >
                ➕ Adicionar Aluno
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div className="alert-box alert-box--error" role="alert" style={{ marginTop: 'var(--space-4)' }}>
          <IconAlertCircle size={18} />
          <span>❌ {error}</span>
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
          {loading ? 'Enviando...' : 'Enviar e Gerar Feedbacks 🚀'}
        </Button>
      </div>
    </div>
  );
}
