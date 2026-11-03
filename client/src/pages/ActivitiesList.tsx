import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getActivities, setActivityArchived, duplicateActivity, getClasses } from '../services/api';
import type { Activity, Class } from '../types';
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
  const [duplicating, setDuplicating] = useState<Activity | null>(null);
  const [dupTitle, setDupTitle] = useState('');
  const [dupClassId, setDupClassId] = useState('');
  const [classes, setClasses] = useState<Class[] | null>(null);
  const [dupSaving, setDupSaving] = useState(false);
  const [classesError, setClassesError] = useState(false);
  const dupPanelRef = useRef<HTMLHeadingElement | null>(null);

  // Ao abrir o painel de reaplicar, leva o foco (e a tela) até ele
  useEffect(() => {
    if (!duplicating) return;
    const heading = dupPanelRef.current;
    heading?.focus();
    heading?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [duplicating]);

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
    if (archive && !window.confirm(`Arquivar "${activity.title}"?\n\nEla sai do painel e desta lista, mas nada é apagado: os alunos continuam vendo os feedbacks já aprovados e você pode reativar em "Arquivadas".`)) {
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

  function openDuplicate(activity: Activity) {
    setDuplicating(activity);
    setDupTitle(`${activity.title} (cópia)`.slice(0, 200));
    setDupClassId(activity.class_id ? String(activity.class_id) : '');
    setError('');
    setInfo('');
    if (classes === null || classesError) {
      setClasses(null);
      setClassesError(false);
      getClasses()
        .then(setClasses)
        .catch(() => {
          // Sem a lista, não dá para mostrar a turma: a cópia fica sem turma e o professor é avisado
          setClasses([]);
          setClassesError(true);
          setDupClassId('');
        });
    }
  }

  async function handleDuplicate(e: React.FormEvent) {
    e.preventDefault();
    if (!duplicating) return;
    setDupSaving(true);
    setError('');
    try {
      const res = await duplicateActivity(duplicating.id, {
        title: dupTitle.trim(),
        classId: dupClassId ? Number(dupClassId) : null,
      });
      navigate(`/upload/${res.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível reaplicar a atividade.');
      setDupSaving(false);
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

      {duplicating && (
        <Card className="duplicate-panel">
          <form onSubmit={handleDuplicate} aria-label="Reaplicar atividade">
            <h3 className="duplicate-panel__title" ref={dupPanelRef} tabIndex={-1}>
              Reaplicar “{duplicating.title}”
            </h3>
            <p className="duplicate-panel__hint">
              Copia o enunciado, a rubrica, os critérios e as alternativas. Respostas, feedbacks, notas e prazo não
              são copiados.
            </p>
            <div className="duplicate-panel__fields">
              <label className="duplicate-panel__field">
                <span>Título da cópia</span>
                <input
                  value={dupTitle}
                  onChange={(e) => setDupTitle(e.target.value)}
                  maxLength={200}
                  required
                />
              </label>
              <label className="duplicate-panel__field">
                <span>Turma</span>
                <select
                  value={dupClassId}
                  onChange={(e) => setDupClassId(e.target.value)}
                  disabled={classes === null}
                  aria-busy={classes === null}
                >
                  {classes === null && dupClassId && <option value={dupClassId}>Carregando turmas...</option>}
                  <option value="">Sem turma</option>
                  {(classes || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {classesError && (
              <p className="duplicate-panel__hint" role="alert">
                Não foi possível carregar suas turmas. A cópia será criada sem turma; você pode tentar de novo
                fechando e abrindo este painel.
              </p>
            )}
            <div className="table-actions">
              <Button type="button" variant="ghost" onClick={() => setDuplicating(null)} disabled={dupSaving}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={dupSaving} disabled={dupSaving || !dupTitle.trim() || classes === null}>
                Criar cópia e enviar respostas
              </Button>
            </div>
          </form>
        </Card>
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
                aria-pressed={view === 'ativas'}
                onClick={() => setView('ativas')}
              >
                Ativas ({activities.length - archivedCount})
              </button>
              <button
                type="button"
                className={`filter-tab ${view === 'arquivadas' ? 'active' : ''}`}
                aria-pressed={view === 'arquivadas'}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            openDuplicate(a);
                          }}
                          id={`btn-duplicate-${a.id}`}
                          title="Usar a mesma atividade em outra turma"
                        >
                          Reaplicar
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
