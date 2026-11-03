/**
 * ClassProgressPanel — "Evolução da turma" na página de turmas.
 *
 * Mostra, atividade por atividade (em ordem de data), quanto a turma atendeu os critérios da
 * rubrica e a média das notas lançadas; e, para os critérios que se repetem entre atividades,
 * se a turma melhorou ou piorou — por exemplo, depois de uma retomada em aula.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getClassProgress } from '../services/api';
import type { ClassProgress } from '../types';
import { ProgressBar } from './ui/ProgressBar';

function formatDate(value: string | null): string {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function formatGrade(n: number | null): string {
  return n === null ? '—' : String(n).replace('.', ',');
}

export function ClassProgressPanel({ classId }: { classId: number }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ClassProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
  }, [classId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getClassProgress(classId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar a evolução.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, classId]);

  return (
    <details className="insights class-progress" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="insights__summary">
        <span className="insights__title">Evolução da turma</span>
        <span className="insights__hint">como a turma foi em cada atividade corrigida</span>
      </summary>
      <div className="insights__body">
        {open && !data && !error && <p className="insights__muted">Carregando...</p>}
        {error && <p className="insights__error" role="alert">{error}</p>}
        {data && data.activities.length === 0 && (
          <p className="insights__muted">Nenhuma atividade desta turma tem feedbacks gerados ainda.</p>
        )}
        {data && data.activities.length > 0 && (
          <>
            <section className="insights__section">
              <h4 className="insights__section-title">Critérios atendidos por atividade</h4>
              <ol className="class-progress__list">
                {data.activities.map((a) => {
                  const percent = a.criteria_percent ?? a.objective_percent;
                  return (
                    <li key={a.activity_id} className="class-progress__item">
                      <div className="class-progress__head">
                        <Link to={`/review/${a.activity_id}`} className="insights__link">{a.title}</Link>
                        <span className="insights__muted">
                          {a.date ? `${formatDate(a.date)} · ` : ''}média {formatGrade(a.average_grade)}
                          {a.is_archived ? ' · arquivada' : ''}
                        </span>
                      </div>
                      {percent !== null ? (
                        <ProgressBar
                          value={percent}
                          label={a.criteria_percent !== null ? 'Critérios atendidos' : 'Acertos na múltipla escolha'}
                          color={percent < 50 ? 'red' : percent < 75 ? 'amber' : 'green'}
                        />
                      ) : (
                        <span className="insights__muted">Sem critérios avaliados nesta atividade.</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            {data.recurring_criteria.length > 0 && (
              <section className="insights__section">
                <h4 className="insights__section-title">Critérios que se repetem (da primeira à última atividade)</h4>
                <ul className="class-progress__recurring">
                  {data.recurring_criteria.map((c) => (
                    <li key={c.criterio}>
                      <strong>{c.criterio}</strong>
                      <span className="insights__muted"> — {c.points.map((p) => `${p.percent}%`).join(' → ')} </span>
                      <span
                        className={`class-progress__change ${c.change > 0 ? 'class-progress__change--up' : c.change < 0 ? 'class-progress__change--down' : ''}`}
                      >
                        {c.change > 0 ? `melhorou ${c.change} pontos` : c.change < 0 ? `caiu ${-c.change} pontos` : 'sem mudança'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </details>
  );
}
