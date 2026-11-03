/**
 * EditActivityPanel — edita os dados gerais da atividade (título, disciplina, prazo e turma).
 * A turma só pode mudar enquanto a atividade não tem respostas: o servidor confere e explica.
 */
import { useEffect, useRef, useState } from 'react';
import { getClasses, updateActivityDetails } from '../services/api';
import type { Activity, Class } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface EditActivityPanelProps {
  activity: Activity;
  hasResponses: boolean;
  onSaved: (updated: Activity) => void;
  onCancel: () => void;
}

/** "2026-12-01T00:00:00" ou "2026-12-01" → "2026-12-01" (valor do input type=date). */
function toDateInput(value?: string | null): string {
  return value ? String(value).slice(0, 10) : '';
}

export function EditActivityPanel({ activity, hasResponses, onSaved, onCancel }: EditActivityPanelProps) {
  const [title, setTitle] = useState(activity.title);
  const [subject, setSubject] = useState(activity.subject || '');
  const [dueDate, setDueDate] = useState(toDateInput(activity.due_date));
  const [classId, setClassId] = useState(activity.class_id ? String(activity.class_id) : '');
  const [classes, setClasses] = useState<Class[] | null>(hasResponses ? [] : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (hasResponses) return;
    getClasses()
      .then(setClasses)
      .catch(() => setClasses([]));
  }, [hasResponses]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await updateActivityDetails(activity.id, {
        title: title.trim(),
        subject: subject.trim() || null,
        dueDate: dueDate || null,
        ...(hasResponses ? {} : { classId: classId ? Number(classId) : null }),
      });
      onSaved(res.activity);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  }

  return (
    <Card className="duplicate-panel">
      <form onSubmit={handleSubmit} aria-label="Editar dados da atividade">
        <h3 className="duplicate-panel__title" ref={headingRef} tabIndex={-1}>
          Editar dados da atividade
        </h3>
        <p className="duplicate-panel__hint">
          Enunciado, rubrica e critérios não mudam aqui, para os feedbacks já gerados continuarem coerentes. Para
          mudar o enunciado, use “Reaplicar” na lista de atividades e ajuste a cópia.
        </p>
        <div className="duplicate-panel__fields">
          <label className="duplicate-panel__field">
            <span>Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </label>
          <label className="duplicate-panel__field">
            <span>Disciplina</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100} />
          </label>
          <label className="duplicate-panel__field">
            <span>Prazo de entrega</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="duplicate-panel__field">
            <span>Turma</span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={hasResponses || classes === null}
              aria-describedby={hasResponses ? 'edit-class-hint' : undefined}
            >
              {(hasResponses || classes === null) && classId && (
                <option value={classId}>{activity.class_name || 'Turma atual'}</option>
              )}
              <option value="">Sem turma</option>
              {(classes || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {hasResponses && (
              <span id="edit-class-hint" className="duplicate-panel__hint" style={{ fontWeight: 400, margin: 0 }}>
                A turma não muda depois que chegam respostas.
              </span>
            )}
          </label>
        </div>
        {error && (
          <p className="insights__error" role="alert">
            {error}
          </p>
        )}
        <div className="table-actions">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={saving || !title.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}
