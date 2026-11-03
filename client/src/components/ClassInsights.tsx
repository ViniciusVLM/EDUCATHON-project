/**
 * ClassInsights — "Diagnóstico da turma" na tela de revisão.
 *
 * Mostra o que a turma inteira acertou e errou (critério por critério), a distribuição
 * das notas lançadas pelo professor, os alunos que pedem atenção e o tempo médio de
 * revisão. O tempo de correção manual é uma estimativa do próprio professor (fica só no
 * navegador dele): o sistema não inventa esse número.
 */
import { useEffect, useState } from 'react';
import { getActivityInsights } from '../services/api';
import type { ActivityInsights } from '../types';
import { ProgressBar } from './ui/ProgressBar';
import { formatDuration } from '../services/format';

const MANUAL_ESTIMATE_KEY = 'educathon_manual_minutes_per_answer';

function readManualEstimate(): string {
  try {
    return localStorage.getItem(MANUAL_ESTIMATE_KEY) || '';
  } catch {
    return '';
  }
}

function saveManualEstimate(value: string) {
  try {
    if (value) localStorage.setItem(MANUAL_ESTIMATE_KEY, value);
    else localStorage.removeItem(MANUAL_ESTIMATE_KEY);
  } catch {
    // navegador sem armazenamento: o valor vale só nesta tela
  }
}

function formatGrade(n: number | null): string {
  return n === null ? '—' : String(n).replace('.', ',');
}

interface ClassInsightsProps {
  activityId: number;
  /** Muda quando os feedbacks mudam (aprovação, edição) para recarregar o diagnóstico. */
  refreshKey: string;
  /** Leva o professor ao aluno na lista de revisão. */
  onSelectStudent?: (responseId: number) => void;
}

export function ClassInsights({ activityId, refreshKey, onSelectStudent }: ClassInsightsProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ActivityInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualMinutes, setManualMinutes] = useState(readManualEstimate);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getActivityInsights(activityId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar o diagnóstico.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activityId, refreshKey]);

  function handleManualChange(value: string) {
    const clean = value.replace(/[^\d,.]/g, '').slice(0, 5);
    setManualMinutes(clean);
    saveManualEstimate(clean);
  }

  const manual = Number(manualMinutes.replace(',', '.'));
  const hasManual = Number.isFinite(manual) && manual > 0;

  return (
    <details
      className="insights"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="insights__summary">
        <span className="insights__title">Diagnóstico da turma</span>
        <span className="insights__hint">o que a turma acertou, quem precisa de apoio e quanto tempo a revisão levou</span>
      </summary>

      <div className="insights__body">
        {loading && !data && <p className="insights__muted">Carregando o diagnóstico...</p>}
        {error && <p className="insights__error" role="alert">{error}</p>}

        {data && data.totals.with_feedback === 0 && (
          <p className="insights__muted">Gere os feedbacks para ver o diagnóstico da turma.</p>
        )}

        {data && data.totals.with_feedback > 0 && (
          <>
            <div className="insights__cards">
              <div className="insights__card">
                <span className="insights__card-label">Ponto que a turma mais precisa retomar</span>
                {data.weakest_criterion ? (
                  <>
                    <strong className="insights__card-value">{data.weakest_criterion.criterio}</strong>
                    <span className="insights__card-sub">
                      {data.weakest_criterion.atendidos} de {data.weakest_criterion.avaliados} alunos atenderam
                      ({data.weakest_criterion.percent}%)
                    </span>
                  </>
                ) : data.objective ? (
                  <>
                    <strong className="insights__card-value">{data.objective.percent}% de acertos</strong>
                    <span className="insights__card-sub">
                      {data.objective.correct} de {data.objective.answered} alunos acertaram a alternativa
                    </span>
                  </>
                ) : (
                  <span className="insights__card-sub">
                    {data.criteria.length > 0 ? 'Todos os critérios foram atendidos.' : 'Cadastre critérios na rubrica para ver este indicador.'}
                  </span>
                )}
              </div>

              <div className="insights__card">
                <span className="insights__card-label">Média das notas lançadas</span>
                <strong className="insights__card-value">{formatGrade(data.grades.average)}</strong>
                <span className="insights__card-sub">
                  {data.grades.count > 0
                    ? `${data.grades.count} nota(s) · de ${formatGrade(data.grades.min)} a ${formatGrade(data.grades.max)}`
                    : 'Nenhuma nota lançada ainda'}
                </span>
              </div>

              <div className="insights__card">
                <span className="insights__card-label">Alunos que pedem atenção</span>
                <strong className="insights__card-value">{data.attention_total}</strong>
                <span className="insights__card-sub">menos da metade dos critérios, nota abaixo de 5 ou erro na objetiva</span>
              </div>

              <div className="insights__card">
                <span className="insights__card-label">Tempo médio de revisão por aluno</span>
                <strong className="insights__card-value">
                  {data.review_time.average_seconds !== null ? formatDuration(data.review_time.average_seconds) : '—'}
                </strong>
                <span className="insights__card-sub">
                  {data.review_time.timed > 0
                    ? `medido em ${data.review_time.timed} aprovação(ões) · total ${formatDuration(data.review_time.total_seconds)}`
                    : 'Aparece quando você aprova feedbacks nesta tela'}
                </span>
              </div>
            </div>

            {data.review_time.average_seconds !== null && (
              <div className="insights__time">
                <label htmlFor="manual-minutes" className="insights__time-label">
                  Sem o Educathon, quantos minutos você levaria corrigindo e escrevendo o feedback de uma resposta?
                </label>
                <input
                  id="manual-minutes"
                  className="insights__time-input"
                  inputMode="decimal"
                  placeholder="ex.: 6"
                  value={manualMinutes}
                  onChange={(e) => handleManualChange(e.target.value)}
                />
                {hasManual && (
                  <p className="insights__time-result" role="status">
                    {(() => {
                      const manualSec = manual * 60;
                      const avg = data.review_time.average_seconds ?? 0;
                      const saved = manualSec - avg;
                      const students = data.totals.with_feedback;
                      if (saved <= 0) {
                        return 'Pela sua estimativa, a revisão com IA não está economizando tempo nesta atividade.';
                      }
                      return `Pela sua estimativa, cada resposta leva ${formatDuration(avg)} em vez de ${formatDuration(manualSec)}: cerca de ${Math.round((saved / manualSec) * 100)}% menos tempo, ou ${formatDuration(saved * students)} economizados nos ${students} alunos.`;
                    })()}
                  </p>
                )}
              </div>
            )}

            {data.criteria.length > 0 && (
              <section className="insights__section">
                <h4 className="insights__section-title">Critérios da rubrica (do menos ao mais atendido)</h4>
                <div className="insights__bars">
                  {data.criteria.map((c) => (
                    <ProgressBar
                      key={c.criterio}
                      label={`${c.criterio} · ${c.atendidos} de ${c.avaliados}`}
                      value={c.percent}
                      color={c.percent < 50 ? 'red' : c.percent < 75 ? 'amber' : 'green'}
                    />
                  ))}
                </div>
              </section>
            )}

            {data.objective && (
              <section className="insights__section">
                <h4 className="insights__section-title">Alternativas escolhidas</h4>
                <ul className="insights__options">
                  {Object.entries(data.objective.options)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([letter, count]) => (
                      <li key={letter}>
                        <strong>{letter}</strong>: {count} aluno(s)
                      </li>
                    ))}
                </ul>
              </section>
            )}

            {data.grades.count > 0 && (
              <section className="insights__section">
                <h4 className="insights__section-title">Distribuição das notas</h4>
                <div className="insights__histogram" role="img" aria-label="Quantidade de alunos por faixa de nota">
                  {data.grades.distribution.map((b) => {
                    const maxCount = Math.max(...data.grades.distribution.map((x) => x.count), 1);
                    return (
                      <div key={b.label} className="insights__hist-col">
                        <span className="insights__hist-count">{b.count}</span>
                        <span className="insights__hist-bar" style={{ height: `${Math.max(4, (b.count / maxCount) * 72)}px` }} />
                        <span className="insights__hist-label">{b.label}</span>
                      </div>
                    );
                  })}
                </div>
                {data.ai_agreement && (
                  <p className="insights__muted">
                    Nota sugerida pela IA x sua nota: diferença média de {formatGrade(data.ai_agreement.average_difference)} ponto(s);
                    {' '}{data.ai_agreement.within_one_point} de {data.ai_agreement.compared} ficaram a até 1 ponto da sua.
                  </p>
                )}
              </section>
            )}

            {data.attention.length > 0 && (
              <section className="insights__section">
                <h4 className="insights__section-title">Quem pode precisar de apoio</h4>
                <ul className="insights__attention">
                  {data.attention.map((a) => (
                    <li key={a.response_id}>
                      {onSelectStudent ? (
                        <button type="button" className="insights__link" onClick={() => onSelectStudent(a.response_id)}>
                          {a.student_name}
                        </button>
                      ) : (
                        <strong>{a.student_name}</strong>
                      )}
                      <span className="insights__muted"> — {a.reasons.join(', ')}</span>
                    </li>
                  ))}
                </ul>
                {data.attention_total > data.attention.length && (
                  <p className="insights__muted">e mais {data.attention_total - data.attention.length} aluno(s).</p>
                )}
              </section>
            )}

            {data.teacher_edits.approved > 0 && (
              <p className="insights__muted">
                Você editou o texto da IA em {data.teacher_edits.edited} de {data.teacher_edits.approved} feedback(s) aprovado(s)
                ({data.teacher_edits.percent}%).
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
