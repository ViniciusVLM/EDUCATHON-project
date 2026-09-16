import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActivities } from '../services/api';
import type { Activity } from '../types';

export default function ActivitiesList() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getActivities()
      .then(setActivities)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        className="page-container"
        style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}
      >
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2 className="page-title">📋 Atividades</h2>
          <p className="page-subtitle">Todas as atividades já criadas.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/setup')}
          id="btn-new-activity"
        >
          ✨ Nova Atividade
        </button>
      </div>

      {error && (
        <div className="toast toast-error" style={{ position: 'static', marginBottom: '1.5rem' }}>
          ❌ {error}
        </div>
      )}

      {activities.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3 className="empty-state-title">Nenhuma atividade ainda</h3>
          <p className="empty-state-text">
            Crie sua primeira atividade e comece a usar o copiloto pedagógico.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/setup')}
            id="btn-create-first-activity"
          >
            Criar a primeira
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Nível</th>
                <th>Criada em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr
                  key={a.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/review/${a.id}`)}
                >
                  <td style={{ fontWeight: 600 }}>{a.title}</td>
                  <td>
                    <span className="badge badge-pending">{a.education_level}</span>
                  </td>
                  <td>{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/upload/${a.id}`);
                        }}
                        id={`btn-upload-${a.id}`}
                        title="Enviar respostas"
                      >
                        📤 Upload
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/review/${a.id}`);
                        }}
                        id={`btn-review-${a.id}`}
                      >
                        Abrir →
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
