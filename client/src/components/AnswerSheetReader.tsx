/**
 * AnswerSheetReader — o professor envia PDF ou fotos das provas respondidas, a IA transcreve
 * o nome e as respostas de cada aluno, e o professor confere/corrige tudo antes de enviar.
 * Os arquivos não ficam salvos: são lidos e descartados no servidor.
 */
import { useRef, useState, DragEvent } from 'react';
import { readAnswerSheets } from '../services/api';
import { readAsBase64, shrinkImage } from '../services/files';
import { Button } from './ui/Button';
import { IconAlertCircle, IconCheckCircle, IconDocument, IconTrash } from './ui/Icons';

export const MAX_SHEET_BYTES = 14 * 1024 * 1024;
const ACCEPT = '.pdf,.docx,.txt,image/*,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ScannedStudent {
  key: string;
  name: string;
  answers: string[];
  note: string | null;
  source: string;
}

interface AnswerSheetReaderProps {
  activityId: number;
  /** Enunciados das perguntas da atividade, na ordem */
  questions: string[];
  isObjective: boolean;
  students: ScannedStudent[];
  onChange: (students: ScannedStudent[]) => void;
}

let seq = 0;
const newKey = () => `s${Date.now()}-${seq++}`;

export function AnswerSheetReader({ activityId, questions, isObjective, students, onChange }: AnswerSheetReaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const count = Math.max(questions.length, 1);

  async function handleFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    setErrors([]);
    setWarnings([]);
    let collected = [...students];
    const newErrors: string[] = [];
    const newWarnings: string[] = [];
    for (const [i, file] of files.entries()) {
      setLoading(files.length > 1 ? `Lendo ${file.name} (${i + 1} de ${files.length})...` : `Lendo ${file.name}...`);
      try {
        const blob = await shrinkImage(file);
        if (blob.size > MAX_SHEET_BYTES) throw new Error('O arquivo é maior que o limite de 14 MB.');
        const result = await readAnswerSheets(activityId, file.name, await readAsBase64(blob));
        collected = [
          ...collected,
          ...result.students.map((s) => ({
            key: newKey(),
            name: s.name,
            answers: Array.from({ length: count }, (_, j) => s.answers[j] ?? ''),
            note: s.note,
            source: s.page ? `${file.name}, página ${s.page}` : file.name,
          })),
        ];
        onChange(collected);
        newWarnings.push(...result.warnings.map((w) => `${file.name}: ${w}`));
      } catch (err: unknown) {
        newErrors.push(`${file.name}: ${err instanceof Error ? err.message : 'não foi possível ler o arquivo.'}`);
      }
    }
    setErrors(newErrors);
    setWarnings(newWarnings);
    setLoading('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function update(key: string, patch: Partial<ScannedStudent>) {
    onChange(students.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function updateAnswer(key: string, index: number, value: string) {
    onChange(students.map((s) => (s.key === key ? { ...s, answers: s.answers.map((a, j) => (j === index ? value : a)) } : s)));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!loading) handleFiles(e.dataTransfer.files);
  }

  const withProblems = students.filter((s) => s.note || s.answers.some((a) => a.includes('[ilegível]'))).length;

  return (
    <div className="sheet-reader">
      <div
        className={`exam-import__drop${dragging ? ' exam-import__drop--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="exam-import__icon" aria-hidden="true"><IconDocument size={24} /></div>
        <div className="exam-import__text">
          <h3 className="exam-import__title">Ler provas respondidas</h3>
          <p className="input-hint">
            Envie o PDF escaneado ou fotos das provas dos alunos (pode escolher vários arquivos). A IA transcreve o nome
            e as respostas de cada um, sem corrigir. Você confere tudo abaixo antes de enviar.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          loading={Boolean(loading)}
          onClick={() => inputRef.current?.click()}
          icon={<IconDocument size={16} />}
          id="btn-read-sheets"
        >
          {students.length > 0 ? 'Adicionar mais arquivos' : 'Escolher arquivos'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          aria-label="Arquivos das provas respondidas"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      <p className="exam-import__privacy">
        Os arquivos não ficam salvos: são lidos e descartados. Até 14 MB por arquivo. Precisa da chave do Gemini (no modo
        demonstração, só Word ou .txt).
      </p>

      {loading && <p className="sheet-reader__loading" role="status">{loading} Isso pode levar até um minuto.</p>}
      {errors.map((e) => (
        <div key={e} className="alert-box alert-box--error" role="alert"><IconAlertCircle size={18} /><span>{e}</span></div>
      ))}
      {warnings.map((w) => (
        <p key={w} className="exam-import__notice">{w}</p>
      ))}

      {students.length > 0 && (
        <>
          <div className="sheet-reader__summary" role="status">
            <IconCheckCircle size={16} />{' '}
            <strong>{students.length === 1 ? '1 aluno lido' : `${students.length} alunos lidos`}</strong>.{' '}
            {withProblems > 0
              ? `${withProblems} com trecho ilegível ou observação: confira esses primeiro.`
              : 'Confira os nomes e as respostas antes de enviar.'}
          </div>
          <ol className="sheet-reader__list">
            {students.map((s, i) => (
              <li key={s.key} className={`sheet-card${s.note ? ' sheet-card--warn' : ''}`}>
                <div className="sheet-card__head">
                  <span className="multi-answers__num">{i + 1}</span>
                  <input
                    className="input sheet-card__name"
                    value={s.name}
                    aria-label={`Nome do aluno ${i + 1}`}
                    onChange={(e) => update(s.key, { name: e.target.value })}
                  />
                  <span className="sheet-card__source">{s.source}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(students.filter((x) => x.key !== s.key))}
                    aria-label={`Remover ${s.name || `aluno ${i + 1}`}`}
                    title="Remover"
                  >
                    <IconTrash size={16} />
                  </Button>
                </div>
                {s.note && <p className="sheet-card__note">Observação da leitura: {s.note}</p>}
                {s.answers.map((a, j) => (
                  <div key={j} className="multi-answers__item">
                    <label className="multi-answers__question" htmlFor={`sheet-${s.key}-${j}`}>
                      {count > 1 && <span className="multi-answers__num">{j + 1}</span>} {questions[j] || (isObjective ? 'Alternativa marcada' : 'Resposta')}
                    </label>
                    <textarea
                      id={`sheet-${s.key}-${j}`}
                      className={`textarea${a.includes('[ilegível]') ? ' textarea--warn' : ''}`}
                      rows={isObjective ? 1 : 2}
                      value={a}
                      placeholder="Em branco"
                      onChange={(e) => updateAnswer(s.key, j, e.target.value)}
                    />
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
