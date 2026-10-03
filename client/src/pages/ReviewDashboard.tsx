import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getActivity,
  generateFeedbacks,
  getProgress as fetchProgress,
  updateFeedback,
  approveFeedback,
  regenerateFeedback,
} from '../services/api';
import type { ActivityWithResponses, StudentResponse, Progress, FilterType, FeedbackParsed, CriterionScore } from '../types';

export default function ReviewDashboard() {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<ActivityWithResponses | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editText, setEditText] = useState('');
  const [currentCriteriaScores, setCurrentCriteriaScores] = useState<CriterionScore[]>([]);
  const [filter, setFilter] = useState<FilterType>('todos');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadActivity = useCallback(async () => {
    try {
      const data = await getActivity(Number(activityId));
      setActivity(data);
      setLoading(false);

      try {
        const prog = await fetchProgress(Number(activityId));
        setProgress(prog);
        if (prog.status === 'processing') {
          setGenerating(true);
        }
      } catch {
        // ignora erro ao buscar progresso inicial
      }

      // Auto-select first response
      const responses = filterResponses(data.responses, filter);
      if (responses.length > 0 && selectedIndex >= responses.length) {
        setSelectedIndex(0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar atividade.';
      setError(msg);
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // Poll progress while generating
  useEffect(() => {
    if (!generating) return;

    const interval = setInterval(async () => {
      try {
        const prog = await fetchProgress(Number(activityId));
        setProgress(prog);

        // Para o polling se completo ou com erro
        if (prog.status === 'complete' || prog.status === 'error') {
          setGenerating(false);
          loadActivity();
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [generating, activityId, loadActivity]);

  function filterResponses(responses: StudentResponse[], f: FilterType): StudentResponse[] {
    if (f === 'todos') return responses;
    return responses.filter((r) => r.status === f);
  }

  const filteredResponses = activity ? filterResponses(activity.responses, filter) : [];
  const selected = filteredResponses[selectedIndex] || null;

  // Sync edit text and criteria when selection changes
  useEffect(() => {
    if (selected) {
      setEditText(selected.teacher_feedback || selected.ai_feedback_text || '');

      let scores: CriterionScore[] = [];
      if (selected.criteria_scores) {
        try {
          scores = typeof selected.criteria_scores === 'string'
            ? JSON.parse(selected.criteria_scores)
            : selected.criteria_scores;
        } catch (e) {
          console.warn('Erro ao parsear criteria_scores:', e);
        }
      } else if (selected.ai_feedback_json) {
        try {
          const parsed = JSON.parse(selected.ai_feedback_json);
          if (parsed?.criterios_avaliacao) {
            scores = parsed.criterios_avaliacao;
          }
        } catch {
          // ignore
        }
      }
      setCurrentCriteriaScores(scores || []);
    } else {
      setCurrentCriteriaScores([]);
    }
  }, [selected?.id, selected?.teacher_feedback, selected?.ai_feedback_text, selected?.criteria_scores, selected?.ai_feedback_json]);

  function handleToggleCriterion(idx: number) {
    setCurrentCriteriaScores((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], atendido: !updated[idx].atendido };
      return updated;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateFeedbacks(Number(activityId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar feedbacks.';
      setError(msg);
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!selected?.feedback_id) return;
    setActionLoading('save');
    try {
      await updateFeedback(selected.feedback_id, {
        teacherFeedback: editText,
        criteriaScores: currentCriteriaScores,
      });
      await loadActivity();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar feedback.';
      setError(msg);
    }
    setActionLoading('');
  }

  async function handleApprove() {
    if (!selected?.feedback_id) return;
    setActionLoading('approve');
    try {
      await updateFeedback(selected.feedback_id, {
        teacherFeedback: editText,
        criteriaScores: currentCriteriaScores,
      });
      await approveFeedback(selected.feedback_id);
      await loadActivity();

      // Auto-advance to next pending
      const nextPending = filteredResponses.findIndex(
        (r, i) => i > selectedIndex && r.status !== 'aprovado'
      );
      if (nextPending !== -1) setSelectedIndex(nextPending);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao aprovar feedback.';
      setError(msg);
    }
    setActionLoading('');
  }

  async function handleRegenerate() {
    if (!selected?.feedback_id) return;
    setActionLoading('regenerate');
    try {
      await regenerateFeedback(selected.feedback_id);
      await loadActivity();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao regenerar feedback.';
      setError(msg);
    }
    setActionLoading('');
  }

  function getStatusBadge(status: string | null) {
    switch (status) {
      case 'aprovado':
        return <span className="badge badge-approved">✅ Aprovado</span>;
      case 'revisado':
        return <span className="badge badge-reviewed">✏️ Editado</span>;
      case 'pendente':
        return <span className="badge badge-pending">🟡 Pendente</span>;
      default:
        return <span className="badge badge-pending">⏳ Sem feedback</span>;
    }
  }

  function getParsedFeedback(): FeedbackParsed | null {
    if (!selected?.ai_feedback_json) return null;
    try {
      return JSON.parse(selected.ai_feedback_json);
    } catch {
      return null;
    }
  }

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem' }}></div>
          <p>Carregando atividade...</p>
        </div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-state-icon">😕</div>
          <h3 className="empty-state-title">Atividade não encontrada</h3>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Voltar ao início</button>
        </div>
      </div>
    );
  }

  // Check if feedbacks need to be generated
  const needsGeneration = activity.responses.some((r) => !r.feedback_id);

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="page-title">📋 {activity.title}</h2>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>{activity.question}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate(`/export/${activityId}`)}>
          📥 Exportar Resultados
        </button>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-item">
          <div>
            <div className="stat-value">{activity.stats.total_students}</div>
            <div className="stat-label">Alunos</div>
          </div>
        </div>
        <div className="stat-item">
          <div>
            <div className="stat-value" style={{ color: 'var(--warning-400)' }}>{activity.stats.pending || 0}</div>
            <div className="stat-label">Pendentes</div>
          </div>
        </div>
        <div className="stat-item">
          <div>
            <div className="stat-value" style={{ color: 'var(--success-400)' }}>{activity.stats.approved || 0}</div>
            <div className="stat-label">Aprovados</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span className="stat-label">Progresso</span>
            <span className="stat-label">
              {activity.stats.approved || 0} / {activity.stats.total_students}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{
                width: `${activity.stats.total_students > 0
                  ? ((activity.stats.approved || 0) / activity.stats.total_students) * 100
                  : 0}%`
              }}
            />
          </div>
        </div>
      </div>

      {/* Generate button if needed */}
      {needsGeneration && (
        <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '2rem' }}>
          {generating ? (
            <div>
              <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem' }}></div>
              <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                Gerando feedbacks com IA...
              </p>
              {progress && (
                <>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {progress.processed} de {progress.total} processados
                    {progress.errors > 0 && ` (${progress.errors} erros)`}
                  </p>
                  <div className="progress-bar" style={{ maxWidth: 300, margin: '1rem auto 0' }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              {progress && (progress.errors > 0 || progress.status === 'error') ? (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ color: 'var(--danger-400, #ef4444)', fontWeight: 600, marginBottom: '0.5rem' }}>
                    ⚠️ {progress.errors > 0
                      ? `${progress.errors} resposta(s) falharam na geração.`
                      : 'O processamento anterior foi interrompido ou falhou.'}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    {activity.responses.filter((r) => !r.feedback_id).length} aluno(s) ainda sem feedback.
                  </p>
                  <button className="btn btn-primary btn-lg" onClick={handleGenerate}>
                    🔄 Tentar Novamente
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                    {activity.responses.filter((r) => !r.feedback_id).length} alunos ainda não possuem feedback.
                  </p>
                  <button className="btn btn-primary btn-lg" onClick={handleGenerate}>
                    🤖 Gerar Feedbacks com IA
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'todos' ? 'active' : ''}`}
          onClick={() => { setFilter('todos'); setSelectedIndex(0); }}
        >
          Todos ({activity.responses.length})
        </button>
        <button
          className={`filter-tab ${filter === 'pendente' ? 'active' : ''}`}
          onClick={() => { setFilter('pendente'); setSelectedIndex(0); }}
        >
          🟡 Pendentes ({activity.stats.pending || 0})
        </button>
        <button
          className={`filter-tab ${filter === 'aprovado' ? 'active' : ''}`}
          onClick={() => { setFilter('aprovado'); setSelectedIndex(0); }}
        >
          ✅ Aprovados ({activity.stats.approved || 0})
        </button>
      </div>

      {/* Main Review Layout */}
      {filteredResponses.length > 0 ? (
        <div className="review-layout">
          {/* Sidebar - Student List */}
          <div className="review-sidebar">
            {filteredResponses.map((response, i) => (
              <div
                key={response.id}
                className={`review-student-card ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => setSelectedIndex(i)}
              >
                <span className="review-student-name">{response.student_name}</span>
                {getStatusBadge(response.status)}
              </div>
            ))}
          </div>

          {/* Main Panel */}
          {selected && (
            <div className="review-main animate-fade-in" key={selected.id}>
              {/* AI Analysis Card (if available) */}
              {getParsedFeedback() && (
                <div className="card" style={{ padding: '1rem 1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--success-400)', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        ✅ Pontos Fortes
                      </div>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                        {getParsedFeedback()?.pontos_fortes}
                      </p>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning-400)', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        ⚠️ Lacunas
                      </div>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                        {getParsedFeedback()?.lacunas}
                      </p>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--info-400)', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        💡 Sugestão
                      </div>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                        {getParsedFeedback()?.sugestao_melhoria}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Side-by-side panels */}
              <div className="review-panels">
                {/* Left: Student Response & Criteria */}
                <div className="review-panel">
                  <div className="review-panel-header">
                    <span className="review-panel-title">📄 Resposta do Aluno</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      {selected.student_name}
                    </span>
                  </div>
                  <div className="review-content" style={{ whiteSpace: 'pre-wrap' }}>
                    {selected.original_response}
                  </div>

                  {/* Rubric Criteria Evaluation */}
                  {currentCriteriaScores.length > 0 && (
                    <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                          🎯 Avaliação por Critério
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {currentCriteriaScores.filter((c) => c.atendido).length} de {currentCriteriaScores.length} atendidos
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {currentCriteriaScores.map((c, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '0.75rem',
                              borderRadius: 'var(--radius-lg, 8px)',
                              background: 'var(--surface-800)',
                              border: `1px solid ${c.atendido ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                                {c.criterio}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleCriterion(idx)}
                                className={`badge ${c.atendido ? 'badge-approved' : 'badge-danger'}`}
                                style={{
                                  cursor: 'pointer',
                                  border: 'none',
                                  padding: '0.25rem 0.6rem',
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 600,
                                }}
                                title="Clique para alternar se o critério foi atendido"
                              >
                                {c.atendido ? '✅ Atendido' : '❌ Não atendido'}
                              </button>
                            </div>
                            {c.evidencia && (
                              <div style={{ marginTop: '0.4rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'rgba(15, 23, 42, 0.6)', padding: '0.35rem 0.5rem', borderRadius: '4px', borderLeft: '3px solid var(--primary-400)' }}>
                                🔍 Evidência: "{c.evidencia}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Feedback Editor */}
                <div className="review-panel">
                  <div className="review-panel-header">
                    <span className="review-panel-title">✍️ Feedback para o Aluno</span>
                    {getStatusBadge(selected.status)}
                  </div>
                  {selected.ai_feedback_text ? (
                    <textarea
                      className="review-editor"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      placeholder="O feedback será gerado pela IA..."
                    />
                  ) : (
                    <div className="review-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p style={{ color: 'var(--text-muted)' }}>
                        Clique em "Gerar Feedbacks" para a IA analisar esta resposta.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {selected.feedback_id && (
                <div className="review-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={handleRegenerate}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'regenerate' ? (
                      <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span>
                    ) : '🔄'} Regenerar
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleSave}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'save' ? (
                      <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span>
                    ) : '💾'} Salvar Edição
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleApprove}
                    disabled={!!actionLoading || selected.status === 'aprovado'}
                  >
                    {actionLoading === 'approve' ? (
                      <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span>
                    ) : '✅'} Aprovar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3 className="empty-state-title">Nenhuma resposta neste filtro</h3>
          <p className="empty-state-text">Altere o filtro ou envie mais respostas.</p>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="toast-container">
          <div className="toast toast-error">
            ❌ {error}
            <button className="btn btn-ghost btn-sm" onClick={() => setError('')} style={{ marginLeft: 'auto' }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
