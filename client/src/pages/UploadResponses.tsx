import { useState, useRef, useEffect, DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uploadCSV, addManualResponses, previewCSV, getActivity } from '../services/api';
import type { ActivityWithResponses } from '../types';

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
        const message = err instanceof Error ? err.message : 'Erro ao ler o CSV.';
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
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar respostas.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <h2 className="page-title">📤 Enviar Respostas</h2>
      <p className="page-subtitle">
        Envie as respostas dos alunos via arquivo CSV ou digite manualmente.
      </p>

      {activity && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            padding: '0.85rem 1.15rem',
            background: 'var(--surface-800)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--surface-700)',
            marginBottom: '1.75rem',
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {activity.title}
            </div>
            <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
              {activity.class_name ? (
                <span>
                  🏫 Turma: <strong style={{ color: 'var(--color-primary-light, #818cf8)' }}>{activity.class_name}</strong>
                  {activity.class_code && ` (${activity.class_code})`}
                  <span
                    style={{
                      marginLeft: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      color: 'var(--color-success, #10b981)',
                      fontWeight: 500,
                    }}
                  >
                    ✓ Vínculo e e-mails automáticos ativos
                  </span>
                </span>
              ) : (
                <span>Sem turma vinculada (avulso)</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="filter-tabs" style={{ marginBottom: '2rem' }}>
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
        <div className="card">
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
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem' }}>Prévia dos dados</h4>
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
                        <td>{row.student_name}</td>
                        <td>{row.original_response.length > 100
                          ? row.original_response.substring(0, 100) + '...'
                          : row.original_response}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvPreview.length > 10 && (
                <p className="input-hint" style={{ marginTop: '0.5rem' }}>
                  Mostrando 10 de {csvPreview.length} respostas.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="form-grid">
            {manualEntries.map((entry, i) => (
              <div key={i} className="card" style={{ padding: '1rem', background: 'var(--surface-800)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Aluno {i + 1}</span>
                  {manualEntries.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeManualRow(i)}
                    >
                      🗑️ Remover
                    </button>
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
                      style={{ minHeight: '60px' }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addManualRow}
            >
              ➕ Adicionar Aluno
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="toast toast-error animate-slide-up" style={{ position: 'static', marginTop: '1rem' }}>
          ❌ {error}
        </div>
      )}

      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate('/setup')}
        >
          ← Voltar
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleSubmit}
          disabled={loading}
          id="btn-submit-responses"
        >
          {loading ? (
            <>
              <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
              Enviando...
            </>
          ) : (
            <>Enviar e Gerar Feedbacks 🚀</>
          )}
        </button>
      </div>
    </div>
  );
}
