import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getActivities, setActivityArchived } from '../services/api';
import type { Activity } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { IconPlus, IconAlertCircle, IconCheckCircle } from '../components/ui/Icons';
import { Mascot } from '../components/ui/Mascot';

export default function ActivitiesList() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'ativas' | 'arquivadas'>('ativas');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    getActivities()
      .then(setActivities)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const archivedCount = activities.filter((a) => a.is_archived).length;
  const visible = useMemo(() => {
    const term = normalize(query);
    return activities.filter((a) => {
      if (Boolean(a.is_archived) !== (view === 'arquivadas')) return false;
      if (!term) return true;
      return normalize(`${a.title} ${a.subject || ''}`).includes(term);
    });
  }, [activities, query, view]);

  async function handleArchive(activity: Activity) {
    const archive = !activity.is_archived;
    if (archive && !window.confirm(`Arquivar "${activity.title}"?\n\nEla sai do painel e desta lista, mas nada é apagado: você pode reativar em "Arquivadas".`)) {
      return;
    }
    setBusyId(activity.id);
    setError('');
    setInfo('');
    try {
      const res = await setActivityArchived(activity.id, archive);
      setActivities((prev) => prev.map((a) => (a.id === activity.id ? { ...a, is_archived: archive ? 1 : 0 } : a)));
      setInfo(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível arquivar a atividade.');
    } finally {
      setBusyId(null);
    }
  }

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
          <h2 className="page-title">Atividades</h2>
          <p className="page-subtitle">Todas as atividades já criadas.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => navigate('/setup')}
          id="btn-new-activity"
          icon={<IconPlus size={18} />}
        >
          Nova Atividade
        </Button>
      </div>

      {notice && (
        <div className="alert-box alert-box--success" role="status">
          <IconCheckCircle size={18} />
          <span>{notice}</span>
        </div>
      )}

      {info && (
        <div className="alert-box alert-box--success" role="status">
          <IconCheckCircle size={18} />
          <span>{info}</span>
        </div>
      )}

      {error && (
        <div className="alert-box alert-box--error" role="alert">
          <IconAlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {activities.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><Mascot size={90} /></div>
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
          <div className="activities-toolbar">
            <input
              type="search"
              className="activities-toolbar__search"
              placeholder="Buscar por título ou disciplina"
              aria-label="Buscar atividades"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="filter-tabs" style={{ margin: 0 }}>
              <button
                type="button"
                className={`filter-tab ${view === 'ativas' ? 'active' : ''}`}
                onClick={() => setView('ativas')}
              >
                Ativas ({activities.length - archivedCount})
              </button>
              <button
                type="button"
                className={`filter-tab ${view === 'arquivadas' ? 'active' : ''}`}
                onClick={() => setView('arquivadas')}
              >
                Arquivadas ({archivedCount})
              </button>
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="activities-toolbar__empty">
              {query
                ? 'Nenhuma atividade encontrada com essa busca.'
                : view === 'arquivadas'
                  ? 'Nenhuma atividade arquivada.'
                  : 'Todas as atividades estão arquivadas.'}
            </p>
          ) : (
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
                {visible.map((a) => (
                  <tr
                    key={a.id}
                    className="table-row-clickable"
                    onClick={() => navigate(`/review/${a.id}`)}
                  >
                    <td className="table-cell-strong">
                      {a.title}
                      {a.subject && <span className="activities-subject"> · {a.subject}</span>}
                    </td>
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
                          Enviar respostas
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
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busyId === a.id}
                          disabled={busyId !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(a);
                          }}
                          id={`btn-archive-${a.id}`}
                        >
                          {a.is_archived ? 'Reativar' : 'Arquivar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      )}
    </div>
  );
}

/** Busca sem diferenciar acentos nem maiúsculas. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
