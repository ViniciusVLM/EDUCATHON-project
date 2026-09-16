import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createActivity, getClasses } from '../services/api';
import type { Class } from '../types';

export default function SetupActivity() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);

  const [form, setForm] = useState({
    title: '',
    question: '',
    rubric: '',
    educationLevel: 'medio',
    subject: '',
    classId: '',
  });

  useEffect(() => {
    getClasses()
      .then(setClasses)
      .catch((err) => console.warn('Erro ao carregar turmas:', err));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.title.trim() || !form.question.trim() || !form.rubric.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      const result = await createActivity({
        title: form.title.trim(),
        question: form.question.trim(),
        rubric: form.rubric.trim(),
        educationLevel: form.educationLevel,
        subject: form.subject.trim() || undefined,
        classId: form.classId ? Number(form.classId) : undefined,
      });
      navigate(`/upload/${result.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar atividade.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <h2 className="page-title">📝 Configurar Atividade</h2>
      <p className="page-subtitle">
        Defina a atividade que seus alunos responderam e o que você espera como resposta ideal.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <div className="form-grid">
          <div className="input-group">
            <label className="input-label" htmlFor="title">
              Título da Atividade *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              className="input"
              placeholder="Ex: Prova de Ciências — Fotossíntese"
              value={form.title}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="input-group">
              <label className="input-label" htmlFor="educationLevel">
                Nível de Ensino
              </label>
              <select
                id="educationLevel"
                name="educationLevel"
                className="select"
                value={form.educationLevel}
                onChange={handleChange}
              >
                <option value="fundamental">Ensino Fundamental</option>
                <option value="medio">Ensino Médio</option>
                <option value="superior">Ensino Superior</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="subject">
                Disciplina / Matéria
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                className="input"
                placeholder="Ex: Biologia, História..."
                value={form.subject}
                onChange={handleChange}
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="classId">
                Turma (opcional)
              </label>
              <select
                id="classId"
                name="classId"
                className="select"
                value={form.classId}
                onChange={handleChange}
              >
                <option value="">Nenhuma turma específica (avulsa)</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.student_count || 0} alunos)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="question">
              Pergunta feita aos alunos *
            </label>
            <p className="input-hint">
              Escreva exatamente a pergunta ou enunciado que os alunos responderam.
            </p>
            <textarea
              id="question"
              name="question"
              className="textarea"
              placeholder="Ex: Explique o processo de fotossíntese e sua importância para os seres vivos."
              value={form.question}
              onChange={handleChange}
              rows={3}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="rubric">
              Rubrica / Gabarito *
            </label>
            <p className="input-hint">
              Descreva o que uma boa resposta deve conter. A IA usará isso para avaliar as respostas.
            </p>
            <textarea
              id="rubric"
              name="rubric"
              className="textarea"
              placeholder="Ex: O aluno deve mencionar: luz solar como fonte de energia, absorção de CO2, uso de água (H2O), produção de glicose e liberação de oxigênio. Deve também explicar a importância para a cadeia alimentar."
              value={form.rubric}
              onChange={handleChange}
              rows={5}
              required
            />
          </div>

          {error && (
            <div className="toast toast-error animate-slide-up" style={{ position: 'static' }}>
              ❌ {error}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate('/')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              id="btn-create-activity"
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
                  Criando...
                </>
              ) : (
                <>Próximo → Enviar Respostas</>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
