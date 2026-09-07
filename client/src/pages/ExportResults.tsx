import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getActivity, exportCSV } from '../services/api';
import type { ActivityWithResponses } from '../types';

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
      } catch (err: any) {
        setError(err.message);
      }
      setLoading(false);
    }
    load();
  }, [activityId]);

  async function handleExport() {
    setExporting(true);
    try {
      await exportCSV(Number(activityId));
    } catch (err: any) {
      setError(err.message);
    }
    setExporting(false);
  }

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-state-icon">😕</div>
          <h3 className="empty-state-title">Atividade não encontrada</h3>
        </div>
      </div>
    );
  }

  const stats = activity.stats;
  const approvedResponses = activity.responses.filter((r) => r.status === 'aprovado');
  const editedCount = activity.responses.filter(
    (r) => r.teacher_feedback && r.teacher_feedback !== r.ai_feedback_text
  ).length;

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <h2 className="page-title">📥 Exportar Resultados</h2>
      <p className="page-subtitle">{activity.title}</p>

      {/* Summary Cards */}
      <div className="export-summary">
        <div className="card export-stat-card">
          <div className="export-stat-value">{stats.total_students}</div>
          <div className="export-stat-label">Total de Alunos</div>
        </div>
        <div className="card export-stat-card">
          <div className="export-stat-value" style={{ background: 'linear-gradient(135deg, var(--success-400), var(--success-500))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {stats.approved || 0}
          </div>
          <div className="export-stat-label">Aprovados</div>
        </div>
        <div className="card export-stat-card">
          <div className="export-stat-value" style={{ background: 'linear-gradient(135deg, var(--info-400), var(--accent-500))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {editedCount}
          </div>
          <div className="export-stat-label">Editados pelo Professor</div>
        </div>
        <div className="card export-stat-card">
          <div className="export-stat-value" style={{ background: 'linear-gradient(135deg, var(--warning-400), var(--warning-500))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {stats.pending || 0}
          </div>
          <div className="export-stat-label">Pendentes</div>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 600 }}>Progresso de Revisão</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {stats.approved || 0} de {stats.total_students} aprovados
          </span>
        </div>
        <div className="progress-bar" style={{ height: 12 }}>
          <div
            className="progress-bar-fill"
            style={{
              width: `${stats.total_students > 0 ? ((stats.approved || 0) / stats.total_students) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Preview Table */}
      {activity.responses.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h4 style={{ marginBottom: '1rem' }}>Prévia dos Feedbacks</h4>
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
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.student_name}</td>
                    <td style={{ maxWidth: 400 }}>
                      {(r.teacher_feedback || r.ai_feedback_text || '—').substring(0, 120)}
                      {(r.teacher_feedback || r.ai_feedback_text || '').length > 120 ? '...' : ''}
                    </td>
                    <td>
                      {r.status === 'aprovado' && <span className="badge badge-approved">✅ Aprovado</span>}
                      {r.status === 'revisado' && <span className="badge badge-reviewed">✏️ Editado</span>}
                      {r.status === 'pendente' && <span className="badge badge-pending">🟡 Pendente</span>}
                      {!r.status && <span className="badge badge-pending">⏳ Sem feedback</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
        <button
          className="btn btn-secondary"
          onClick={() => navigate(`/review/${activityId}`)}
        >
          ← Voltar para Revisão
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleExport}
          disabled={exporting}
          id="btn-export-csv"
        >
          {exporting ? (
            <>
              <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
              Exportando...
            </>
          ) : (
            <>📥 Baixar CSV com Feedbacks</>
          )}
        </button>
      </div>

      {error && (
        <div className="toast-container">
          <div className="toast toast-error">❌ {error}</div>
        </div>
      )}
    </div>
  );
}
