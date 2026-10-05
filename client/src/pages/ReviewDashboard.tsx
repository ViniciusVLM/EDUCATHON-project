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
import type {
  ActivityWithResponses,
  StudentResponse,
  Progress,
  FilterType,
  FeedbackParsed,
  CriterionScore,
} from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { ProgressBar } from '../components/ui/ProgressBar';
import {
  IconCheckCircle,
  IconAlertCircle,
  IconRefresh,
  IconSparkles,
} from '../components/ui/Icons';

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

  function filterResponses(responses: StudentResponse[], f: FilterType): StudentResponse[] {
    if (f === 'todos') return responses;
    return responses.filter((r) => r.status === f);
  }

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

      // Auto-select first response if out of range
      const responses = filterResponses(data.responses, filter);
      if (responses.length > 0 && selectedIndex >= responses.length) {
        setSelectedIndex(0);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(msg);
      setLoading(false);
    }
  }, [activityId, filter, selectedIndex]);

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

  const filteredResponses = activity ? filterResponses(activity.responses, filter) : [];
  const selected = filteredResponses[selectedIndex] || null;

  // Sync edit text and criteria when selection changes
  useEffect(() => {
    if (selected) {
      setEditText(selected.teacher_feedback || selected.ai_feedback_text || '');

      let scores: CriterionScore[] = [];
      if (selected.criteria_scores) {
        try {
          scores =
            typeof selected.criteria_scores === 'string'
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
  }, [
    selected?.id,
    selected?.teacher_feedback,
    selected?.ai_feedback_text,
    selected?.criteria_scores,
    selected?.ai_feedback_json,
  ]);

  // Checa se há edições locais não salvas
  const isDirty = useCallback((): boolean => {
    if (!selected) return false;
    const initialText = selected.teacher_feedback || selected.ai_feedback_text || '';
    if (editText !== initialText) return true;

    let initialScores: CriterionScore[] = [];
    if (selected.criteria_scores) {
      try {
        initialScores =
          typeof selected.criteria_scores === 'string'
            ? JSON.parse(selected.criteria_scores)
            : selected.criteria_scores;
      } catch {
        // ignore
      }
    } else if (selected.ai_feedback_json) {
      try {
        const parsed = JSON.parse(selected.ai_feedback_json);
        if (parsed?.criterios_avaliacao) initialScores = parsed.criterios_avaliacao;
      } catch {
        // ignore
      }
    }

    if (currentCriteriaScores.length !== initialScores.length) return true;
    for (let i = 0; i < currentCriteriaScores.length; i++) {
      if (currentCriteriaScores[i].atendido !== initialScores[i]?.atendido) return true;
    }

    return false;
  }, [selected, editText, currentCriteriaScores]);

  // Troca de aluno com proteção contra descarte acidental
  function handleSelectStudent(newIndex: number) {
    if (newIndex === selectedIndex) return;

    if (isDirty()) {
      const confirmed = window.confirm(
        'Você tem alterações não salvas no feedback atual. Deseja descartar as alterações e continuar?'
      );
      if (!confirmed) return;
    }
    setSelectedIndex(newIndex);
  }

  // Navegação relativa (próximo / anterior)
  const handleNavigateRelative = useCallback(
    (delta: number) => {
      const newIndex = selectedIndex + delta;
      if (newIndex >= 0 && newIndex < filteredResponses.length) {
        handleSelectStudent(newIndex);
      }
    },
    [selectedIndex, filteredResponses.length, isDirty]
  );

  // Troca de filtro com proteção contra descarte acidental
  function handleFilterChange(newFilter: FilterType) {
    if (newFilter === filter) return;

    if (isDirty()) {
      const confirmed = window.confirm(
        'Você tem alterações não salvas no feedback atual. Deseja descartar as alterações e mudar de filtro?'
      );
      if (!confirmed) return;
    }
    setFilter(newFilter);
    setSelectedIndex(0);
  }

  function handleToggleCriterion(idx: number) {
    setCurrentCriteriaScores((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], atendido: !updated[idx].atendido };
      return updated;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      await generateFeedbacks(Number(activityId));
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(msg);
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!selected?.feedback_id) return;
    setActionLoading('save');
    setError('');
    try {
      await updateFeedback(selected.feedback_id, {
        teacherFeedback: editText,
        criteriaScores: currentCriteriaScores,
      });
      await loadActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(msg);
    } finally {
      setActionLoading('');
    }
  }

  const handleApprove = useCallback(async () => {
    if (!selected?.feedback_id) return;
    setActionLoading('approve');
    setError('');
    try {
      await updateFeedback(selected.feedback_id, {
        teacherFeedback: editText,
        criteriaScores: currentCriteriaScores,
      });
      await approveFeedback(selected.feedback_id);
      await loadActivity();

      // Avanço automático para o próximo não aprovado
      let nextIndex = filteredResponses.findIndex(
        (r, i) => i > selectedIndex && r.status !== 'aprovado'
      );
      if (nextIndex === -1) {
        nextIndex = filteredResponses.findIndex(
          (r, i) => i !== selectedIndex && r.status !== 'aprovado'
        );
      }
      if (nextIndex !== -1) {
        setSelectedIndex(nextIndex);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(msg);
    } finally {
      setActionLoading('');
    }
  }, [selected?.feedback_id, editText, currentCriteriaScores, loadActivity, filteredResponses, selectedIndex]);

  async function handleRegenerate() {
    if (!selected?.feedback_id) return;
    setActionLoading('regenerate');
    setError('');
    try {
      await regenerateFeedback(selected.feedback_id);
      await loadActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(msg);
    } finally {
      setActionLoading('');
    }
  }

  // Aprovar todos os pendentes com confirmação
  async function handleApproveAllPending() {
    const pendingWithFeedback =
      activity?.responses.filter((r) => r.feedback_id && r.status !== 'aprovado') || [];
    if (pendingWithFeedback.length === 0) return;

    const confirmed = window.confirm(
      `Tem certeza de que deseja aprovar todos os ${pendingWithFeedback.length} feedbacks pendentes de uma vez?\n\nLembrete de produto: a IA nunca dá nota; o professor é o responsável pedagógico final.`
    );
    if (!confirmed) return;

    setActionLoading('approve-all');
    setError('');
    try {
      await Promise.all(pendingWithFeedback.map((p) => approveFeedback(p.feedback_id!)));
      await loadActivity();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(msg);
    } finally {
      setActionLoading('');
    }
  }

  // Atalhos de teclado (Alt+A para aprovar, Alt+→ para próximo, Alt+← para anterior)
  // Não conflitam com a digitação em textarea/input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      // 1. Aprovar feedback atual:
      // Se estiver digitando: Alt+A ou Ctrl+Enter
      // Se fora de inputs: 'a' ou Alt+A ou Ctrl+Enter
      const isApprove =
        (e.altKey && e.key.toLowerCase() === 'a') ||
        (e.ctrlKey && e.key === 'Enter') ||
        (!isTyping && e.key.toLowerCase() === 'a');

      if (isApprove) {
        if (selected?.feedback_id && selected.status !== 'aprovado' && !actionLoading) {
          e.preventDefault();
          handleApprove();
        }
        return;
      }

      // 2. Próximo aluno:
      // Se digitando: Alt+ArrowRight ou Alt+J
      // Se fora de inputs: ArrowRight ou 'j' ou Alt+ArrowRight
      const isNext =
        (e.altKey && (e.key === 'ArrowRight' || e.key.toLowerCase() === 'j')) ||
        (!isTyping && (e.key === 'ArrowRight' || e.key.toLowerCase() === 'j'));

      if (isNext) {
        e.preventDefault();
        handleNavigateRelative(1);
        return;
      }

      // 3. Aluno anterior:
      // Se digitando: Alt+ArrowLeft ou Alt+K
      // Se fora de inputs: ArrowLeft ou 'k' ou Alt+ArrowLeft
      const isPrev =
        (e.altKey && (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'k')) ||
        (!isTyping && (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'k'));

      if (isPrev) {
        e.preventDefault();
        handleNavigateRelative(-1);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected?.feedback_id, selected?.status, actionLoading, handleApprove, handleNavigateRelative]);

  function getStatusChip(status: string | null) {
    switch (status) {
      case 'aprovado':
        return <Chip variant="green">✅ Aprovado</Chip>;
      case 'revisado':
        return <Chip variant="blue">✏️ Editado</Chip>;
      case 'pendente':
        return <Chip variant="amber">🟡 Pendente</Chip>;
      default:
        return <Chip variant="pink">⏳ Sem feedback</Chip>;
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
      <div className="page-container page-container--center">
        <div>
          <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-4)' }}></div>
          <p style={{ color: 'var(--text-muted)' }}>Carregando atividade...</p>
        </div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="page-container">
        <Card className="empty-state">
          <div className="empty-state-icon">😕</div>
          <h3 className="empty-state-title">Atividade não encontrada</h3>
          <Button variant="primary" onClick={() => navigate('/')}>
            Voltar ao início
          </Button>
        </Card>
      </div>
    );
  }

  const needsGeneration = activity.responses.some((r) => !r.feedback_id);
  const pendingFeedbacksCount = activity.responses.filter(
    (r) => r.feedback_id && r.status !== 'aprovado'
  ).length;

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">📋 {activity.title}</h2>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            {activity.question}
          </p>
        </div>
        <div className="table-actions">
          {pendingFeedbacksCount > 0 && (
            <Button
              variant="success"
              onClick={handleApproveAllPending}
              loading={actionLoading === 'approve-all'}
              disabled={!!actionLoading}
              icon={<IconCheckCircle size={16} />}
            >
              Aprovar todos os pendentes ({pendingFeedbacksCount})
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => navigate(`/export/${activityId}`)}
          >
            📥 Exportar Resultados
          </Button>
        </div>
      </div>

      {/* Stats Bar com Progresso */}
      <div className="stats-bar" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-item">
          <div>
            <div className="stat-value">{activity.stats.total_students}</div>
            <div className="stat-label">Alunos</div>
          </div>
        </div>
        <div className="stat-item">
          <div>
            <div className="stat-value" style={{ color: 'var(--warning-500)' }}>
              {activity.stats.pending || 0}
            </div>
            <div className="stat-label">Pendentes</div>
          </div>
        </div>
        <div className="stat-item">
          <div>
            <div className="stat-value" style={{ color: 'var(--success-500)' }}>
              {activity.stats.approved || 0}
            </div>
            <div className="stat-label">Aprovados</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <ProgressBar
            value={activity.stats.approved || 0}
            max={activity.stats.total_students || 1}
            color="green"
            label="Progresso de Aprovação"
          />
        </div>
      </div>

      {/* Barra de Progresso e Geração de Lote */}
      {needsGeneration && (
        <Card style={{ marginBottom: 'var(--space-6)', textAlign: 'center', padding: 'var(--space-6)' }}>
          {generating ? (
            <div>
              <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-4)' }}></div>
              <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                Gerando feedbacks com IA...
              </p>
              {progress && (
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)' }}>
                    {progress.processed} de {progress.total} processados
                    {progress.errors > 0 && ` (${progress.errors} erros)`}
                  </p>
                  <ProgressBar
                    value={progress.processed}
                    max={progress.total || 1}
                    color="purple"
                    showValue
                  />
                </div>
              )}
            </div>
          ) : (
            <div>
              {progress && (progress.errors > 0 || progress.status === 'error') ? (
                <div>
                  <div style={{ color: 'var(--error-500)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                    ⚠️ {progress.errors > 0
                      ? `${progress.errors} resposta(s) falharam na geração.`
                      : 'O processamento anterior foi interrompido ou falhou.'}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                    {activity.responses.filter((r) => !r.feedback_id).length} aluno(s) ainda sem feedback.
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleGenerate}
                    icon={<IconRefresh size={18} />}
                  >
                    Tentar Novamente
                  </Button>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: 'var(--space-4)', color: 'var(--text-secondary)' }}>
                    {activity.responses.filter((r) => !r.feedback_id).length} alunos ainda não possuem feedback.
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleGenerate}
                    icon={<IconSparkles size={18} />}
                  >
                    Gerar Feedbacks com IA
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Filter Tabs e Dica de Atalhos */}
      <div className="page-header-row" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="filter-tabs" style={{ margin: 0 }}>
          <button
            className={`filter-tab ${filter === 'todos' ? 'active' : ''}`}
            onClick={() => handleFilterChange('todos')}
          >
            Todos ({activity.responses.length})
          </button>
          <button
            className={`filter-tab ${filter === 'pendente' ? 'active' : ''}`}
            onClick={() => handleFilterChange('pendente')}
          >
            🟡 Pendentes ({activity.stats.pending || 0})
          </button>
          <button
            className={`filter-tab ${filter === 'aprovado' ? 'active' : ''}`}
            onClick={() => handleFilterChange('aprovado')}
          >
            ✅ Aprovados ({activity.stats.approved || 0})
          </button>
        </div>

        <div className="review-shortcuts-hint">
          <span>⌨️ Atalhos:</span>
          <kbd>Alt+A</kbd> aprovar • <kbd>Alt+→</kbd> próximo • <kbd>Alt+←</kbd> anterior
        </div>
      </div>

      {/* Layout Principal de Revisão */}
      {filteredResponses.length > 0 ? (
        <div className="review-layout">
          {/* Barra Lateral: Lista de Alunos */}
          <div className="review-sidebar">
            {filteredResponses.map((response, i) => (
              <div
                key={response.id}
                className={`review-student-card ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelectStudent(i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectStudent(i);
                  }
                }}
              >
                <span className="review-student-name">{response.student_name}</span>
                {getStatusChip(response.status)}
              </div>
            ))}
          </div>

          {/* Painel Principal */}
          {selected && (
            <div className="review-main animate-fade-in" key={selected.id}>
              {/* Cartão de Destaques da Análise da IA */}
              {getParsedFeedback() && (
                <Card style={{ padding: 'var(--space-4) var(--space-5)' }}>
                  <div className="review-analysis-grid">
                    <div>
                      <div className="review-analysis-col__title review-analysis-col__title--green">
                        ✅ Pontos Fortes
                      </div>
                      <p className="review-analysis-col__text">
                        {getParsedFeedback()?.pontos_fortes}
                      </p>
                    </div>
                    <div>
                      <div className="review-analysis-col__title review-analysis-col__title--amber">
                        ⚠️ Lacunas
                      </div>
                      <p className="review-analysis-col__text">
                        {getParsedFeedback()?.lacunas}
                      </p>
                    </div>
                    <div>
                      <div className="review-analysis-col__title review-analysis-col__title--blue">
                        💡 Sugestão
                      </div>
                      <p className="review-analysis-col__text">
                        {getParsedFeedback()?.sugestao_melhoria}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Painéis Lado a Lado */}
              <div className="review-panels">
                {/* Lado Esquerdo: Resposta do Aluno & Critérios da Rubrica */}
                <Card className="review-panel">
                  <div className="review-panel-header">
                    <span className="review-panel-title">📄 Resposta do Aluno</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      {selected.student_name}
                    </span>
                  </div>
                  <div className="review-content" style={{ whiteSpace: 'pre-wrap' }}>
                    {selected.original_response}
                  </div>

                  {/* Avaliação por Critério da Rubrica */}
                  {currentCriteriaScores.length > 0 && (
                    <div className="review-criteria-container">
                      <div className="review-criteria-header">
                        <span className="review-criteria-title">
                          🎯 Avaliação por Critério
                        </span>
                        <span className="review-criteria-count">
                          {currentCriteriaScores.filter((c) => c.atendido).length} de{' '}
                          {currentCriteriaScores.length} atendidos
                        </span>
                      </div>
                      <div className="review-criteria-list">
                        {currentCriteriaScores.map((c, idx) => (
                          <div
                            key={idx}
                            className={`review-criterion-card ${
                              c.atendido
                                ? 'review-criterion-card--attended'
                                : 'review-criterion-card--unattended'
                            }`}
                          >
                            <div className="review-criterion-card__row">
                              <span className="review-criterion-card__name">
                                {c.criterio}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleCriterion(idx)}
                                className={`badge ${
                                  c.atendido ? 'badge-approved' : 'badge-danger'
                                }`}
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
                              <div className="review-criterion-card__evidence">
                                🔍 Evidência: "{c.evidencia}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Lado Direito: Editor de Feedback */}
                <Card className="review-panel">
                  <div className="review-panel-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="review-panel-title">✍️ Feedback para o Aluno</span>
                      {isDirty() && (
                        <Chip variant="amber" size="sm">
                          ⚠️ Não salvo
                        </Chip>
                      )}
                    </div>
                    {getStatusChip(selected.status)}
                  </div>
                  {selected.ai_feedback_text ? (
                    <textarea
                      className="review-editor"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      placeholder="O feedback será gerado pela IA..."
                    />
                  ) : (
                    <div
                      className="review-content"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                      }}
                    >
                      <p style={{ color: 'var(--text-muted)' }}>
                        Clique em "Gerar Feedbacks com IA" para processar esta resposta.
                      </p>
                    </div>
                  )}
                </Card>
              </div>

              {/* Barra de Ações */}
              {selected.feedback_id && (
                <div className="review-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleRegenerate}
                    loading={actionLoading === 'regenerate'}
                    disabled={!!actionLoading}
                    icon={<IconRefresh size={16} />}
                  >
                    Regenerar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSave}
                    loading={actionLoading === 'save'}
                    disabled={!!actionLoading}
                  >
                    💾 Salvar Edição
                  </Button>
                  <Button
                    type="button"
                    variant="success"
                    onClick={handleApprove}
                    loading={actionLoading === 'approve'}
                    disabled={!!actionLoading || selected.status === 'aprovado'}
                    icon={<IconCheckCircle size={16} />}
                  >
                    Aprovar
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <Card className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3 className="empty-state-title">Nenhuma resposta neste filtro</h3>
          <p className="empty-state-text">Altere o filtro ou envie mais respostas.</p>
        </Card>
      )}

      {/* Alerta de Erro */}
      {error && (
        <div className="alert-box alert-box--error" role="alert" style={{ marginTop: 'var(--space-6)' }}>
          <IconAlertCircle size={18} />
          <span style={{ flex: 1 }}>❌ {error}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setError('')}
          >
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}
