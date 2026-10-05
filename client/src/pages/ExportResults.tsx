import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getActivity, exportCSV } from '../services/api';
import type { ActivityWithResponses } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { ProgressBar } from '../components/ui/ProgressBar';
import { IconAlertCircle } from '../components/ui/Icons';

export default function ExportResults() {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<ActivityWithResponses | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await getActivity(Number(activityId));
        setActivity(data);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activityId]);

  async function handleExport() {
    setExporting(true);
    try {
      await exportCSV(Number(activityId));
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
      );
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container page-container--center">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="page-container">
        <Card className="empty-state">
          <div className="empty-state-icon">😕</div>
          <h3 className="empty-state-title">Atividade não encontrada</h3>
        </Card>
      </div>
    );
  }

  const stats = activity.stats;
  const editedCount = activity.responses.filter(
    (r) => r.teacher_feedback && r.teacher_feedback !== r.ai_feedback_text
  ).length;

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">📥 Exportar Resultados</h2>
          <p className="page-subtitle">{activity.title}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="export-stats-grid">
        <Card className="export-stat-card">
          <div className="export-stat-card__value export-stat-card__value--purple">
            {stats.total_students}
          </div>
          <div className="export-stat-card__label">Total de Alunos</div>
        </Card>

        <Card className="export-stat-card">
          <div className="export-stat-card__value export-stat-card__value--green">
            {stats.approved || 0}
          </div>
          <div className="export-stat-card__label">Aprovados</div>
        </Card>

        <Card className="export-stat-card">
          <div className="export-stat-card__value export-stat-card__value--blue">
            {editedCount}
          </div>
          <div className="export-stat-card__label">Editados pelo Professor</div>
        </Card>

        <Card className="export-stat-card">
          <div className="export-stat-card__value export-stat-card__value--amber">
            {stats.pending || 0}
          </div>
          <div className="export-stat-card__label">Pendentes</div>
        </Card>
      </div>

      {/* Progress indicator */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <ProgressBar
          label="Progresso de Revisão"
          value={stats.approved || 0}
          max={stats.total_students || 1}
          color="purple"
          showValue
        />
      </Card>

      {/* Preview Table */}
      {activity.responses.length > 0 && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <h4 style={{ marginBottom: 'var(--space-4)' }}>Prévia dos Feedbacks</h4>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Feedback Final</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activity.responses.map((r) => (
                  <tr key={r.id}>
                    <td className="table-cell-strong" style={{ whiteSpace: 'nowrap' }}>
                      {r.student_name}
                    </td>
                    <td style={{ maxWidth: 400 }}>
                      {(r.teacher_feedback || r.ai_feedback_text || '—').substring(0, 120)}
                      {(r.teacher_feedback || r.ai_feedback_text || '').length > 120 ? '...' : ''}
                    </td>
                    <td>
                      {r.status === 'aprovado' && <Chip variant="green">✅ Aprovado</Chip>}
                      {r.status === 'revisado' && <Chip variant="blue">✏️ Editado</Chip>}
                      {r.status === 'pendente' && <Chip variant="amber">🟡 Pendente</Chip>}
                      {!r.status && <Chip variant="pink">⏳ Sem feedback</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="page-header-row" style={{ marginTop: 'var(--space-6)' }}>
        <Button
          variant="ghost"
          onClick={() => navigate(`/review/${activityId}`)}
        >
          ← Voltar para Revisão
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={handleExport}
          loading={exporting}
          disabled={exporting}
          id="btn-export-csv"
        >
          {exporting ? 'Exportando...' : '📥 Baixar CSV com Feedbacks'}
        </Button>
      </div>

      {error && (
        <div className="alert-box alert-box--error" role="alert" style={{ marginTop: 'var(--space-4)' }}>
          <IconAlertCircle size={18} />
          <span>❌ {error}</span>
        </div>
      )}
    </div>
  );
}
