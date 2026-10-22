/**
 * ExamImportPanel — o professor envia o arquivo da prova (PDF, Word, foto ou texto)
 * e a IA devolve rascunhos de atividades para preencher o formulário.
 * O arquivo não é salvo: só é lido e descartado no servidor.
 */
import { useRef, useState, DragEvent } from 'react';
import { importExam } from '../services/api';
import { readAsBase64, shrinkImage } from '../services/files';
import type { ExamImportResult } from '../types';
import { Button } from './ui/Button';
import { IconAlertCircle, IconDocument, IconSparkles } from './ui/Icons';

export const MAX_IMPORT_BYTES = 14 * 1024 * 1024;
const ACCEPT = '.pdf,.docx,.txt,image/*,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface ExamImportPanelProps {
  onImported: (result: ExamImportResult) => void;
}

export function ExamImportPanel({ onImported }: ExamImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setFileName(file.name);
    setLoading(true);
    try {
      const blob = await shrinkImage(file);
      if (blob.size > MAX_IMPORT_BYTES) {
        throw new Error('O arquivo é maior que o limite de 14 MB.');
      }
      const base64 = await readAsBase64(blob);
      const result = await importExam(file.name, base64);
      onImported(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler a prova.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!loading) handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <section className="exam-import" aria-labelledby="exam-import-title">
      <div
        className={`exam-import__drop${dragging ? ' exam-import__drop--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="exam-import__icon" aria-hidden="true">
          <IconSparkles size={24} />
        </div>
        <div className="exam-import__text">
          <h3 id="exam-import-title" className="exam-import__title">Preencher a partir da prova</h3>
          <p className="input-hint">
            Envie o arquivo da prova e a IA preenche as perguntas, a rubrica, os critérios e a turma.
            Você revisa tudo antes de criar. Aceita PDF, Word (.docx), foto ou texto, até 14 MB.
          </p>
        </div>
        <input
          ref={inputRef}
          id="exam-file"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
          disabled={loading}
          aria-label="Arquivo da prova"
        />
        <Button
          type="button"
          variant="primary"
          loading={loading}
          onClick={() => inputRef.current?.click()}
          icon={<IconDocument size={16} />}
          id="btn-import-exam"
        >
          {loading ? 'Lendo a prova...' : 'Escolher arquivo'}
        </Button>
      </div>

      {loading && fileName && (
        <p className="input-hint" role="status">
          Lendo “{fileName}”. Isso pode levar alguns segundos.
        </p>
      )}

      {error && (
        <div className="alert-box alert-box--error" role="alert">
          <IconAlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <p className="exam-import__privacy">
        O arquivo não fica salvo: ele é lido e descartado. Evite enviar provas já respondidas com nomes de alunos.
      </p>
    </section>
  );
}
