import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActivities } from '../services/api';
import type { Activity } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { IconPlus, IconAlertCircle } from '../components/ui/Icons';

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
      <div className="page-container page-container--center">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  function getLevelChipVariant(level?: string): 'blue' | 'pink' | 'purple' {
    if (level === 'fundamental') return 'blue';
    if (level === 'superior') return 'purple';
    return 'pink';
  }

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">📋 Atividades</h2>
          <p className="page-subtitle">Todas as atividades já criadas.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => navigate('/setup')}
          id="btn-new-activity"
          icon={<IconPlus size={18} />}
        >
          ✨ Nova Atividade
        </Button>
      </div>

      {error && (
        <div className="alert-box alert-box--error" role="alert">
          <IconAlertCircle size={18} />
          <span>❌ {error}</span>
        </div>
      )}

      {activities.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">📭</div>
          <h3 className="empty-state-title">Nenhuma atividade ainda</h3>
          <p className="empty-state-text">
            Crie sua primeira atividade e comece a usar o copiloto pedagógico.
          </p>
          <Button
            variant="primary"
            onClick={() => navigate('/setup')}
            id="btn-create-first-activity"
            icon={<IconPlus size={18} />}
          >
            Criar a primeira
          </Button>
        </div>
      ) : (
        <Card>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Nível</th>
                  <th>Criada em</th>
                  <th aria-label="Ações"></th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr
                    key={a.id}
                    className="table-row-clickable"
                    onClick={() => navigate(`/review/${a.id}`)}
                  >
                    <td className="table-cell-strong">{a.title}</td>
                    <td>
                      <Chip variant={getLevelChipVariant(a.education_level)}>
                        {a.education_level}
                      </Chip>
                    </td>
                    <td>{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div className="table-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/upload/${a.id}`);
                          }}
                          id={`btn-upload-${a.id}`}
                          title="Enviar respostas"
                        >
                          📤 Upload
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/review/${a.id}`);
                          }}
                          id={`btn-review-${a.id}`}
                        >
                          Abrir →
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
