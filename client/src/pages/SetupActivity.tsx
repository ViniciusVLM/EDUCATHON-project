import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createActivity, getClasses } from '../services/api';
import type { Class } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconPlus, IconAlertCircle } from '../components/ui/Icons';

interface CriterionInput {
  id: string;
  criterio: string;
  peso: number;
}

export default function SetupActivity() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [criteria, setCriteria] = useState<CriterionInput[]>([]);

  const [form, setForm] = useState({
    title: '',
    question: '',
    rubric: '',
    educationLevel: 'medio',
    subject: '',
    classId: '',
    dueDate: '',
  });

  useEffect(() => {
    getClasses()
      .then(setClasses)
      .catch((err) => console.warn('Erro ao carregar turmas:', err));
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleAddCriterion() {
    setCriteria((prev) => [
      ...prev,
      { id: String(Date.now() + Math.random()), criterio: '', peso: 1 },
    ]);
  }

  function handleRemoveCriterion(id: string) {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  }

  function handleCriterionChange(id: string, field: 'criterio' | 'peso', value: string | number) {
    setCriteria((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        return { ...c, [field]: value };
      })
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.title.trim() || !form.question.trim() || !form.rubric.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    // Validação de critérios e pesos positivos
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      if (!c.criterio.trim()) {
        setError(`O critério #${i + 1} precisa ter um nome preenchido.`);
        return;
      }
      const pesoNum = Number(c.peso);
      if (isNaN(pesoNum) || pesoNum <= 0) {
        setError(`O peso do critério "${c.criterio}" deve ser um número positivo maior que zero.`);
        return;
      }
    }

    const rubricCriteria =
      criteria.length > 0
        ? criteria.map((c) => ({ criterio: c.criterio.trim(), peso: Number(c.peso) || 1 }))
        : undefined;

    setLoading(true);
    try {
      const result = await createActivity({
        title: form.title.trim(),
        question: form.question.trim(),
        rubric: form.rubric.trim(),
        educationLevel: form.educationLevel,
        subject: form.subject.trim() || undefined,
        classId: form.classId ? Number(form.classId) : undefined,
        dueDate: form.dueDate ? form.dueDate : undefined,
        rubricCriteria,
      });
      navigate(`/upload/${result.id}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">📝 Configurar Atividade</h2>
          <p className="page-subtitle">
            Defina a atividade que seus alunos responderam e o que você espera como resposta ideal.
          </p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="form-grid" noValidate>
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

          <div className="form-row">
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
          </div>

          <div className="form-row">
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

            <div className="input-group">
              <label className="input-label" htmlFor="dueDate">
                Prazo de Entrega (opcional)
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="input"
                value={form.dueDate}
                onChange={handleChange}
              />
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

          <div className="input-group">
            <div className="page-header-row" style={{ marginBottom: 'var(--space-2)' }}>
              <div>
                <label className="input-label">
                  🎯 Critérios de Avaliação da Rubrica (opcional)
                </label>
                <p className="input-hint">
                  A IA avaliará individualmente cada critério (atendido/não atendido + evidência). O peso serve apenas para priorizar o feedback.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddCriterion}
                id="btn-add-criterion"
                icon={<IconPlus size={16} />}
              >
                + Adicionar Critério
              </Button>
            </div>

            {criteria.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {criteria.map((item, idx) => (
                  <div key={item.id} className="criterion-card">
                    <div>
                      <label className="input-label" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-1)' }}>
                        Critério #{idx + 1} *
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Ex: Explicação do processo biológico"
                        value={item.criterio}
                        onChange={(e) => handleCriterionChange(item.id, 'criterio', e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="input-label" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-1)' }}>
                        Peso (prioridade &gt; 0) *
                      </label>
                      <input
                        type="number"
                        className="input"
                        min="1"
                        step="1"
                        value={item.peso}
                        onChange={(e) => handleCriterionChange(item.id, 'peso', Number(e.target.value))}
                        required
                      />
                    </div>
                    <div style={{ alignSelf: 'flex-end', paddingBottom: '2px' }}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveCriterion(item.id)}
                        title="Remover critério"
                        style={{ color: 'var(--error-500)' }}
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="alert-box alert-box--error" role="alert">
              <IconAlertCircle size={18} />
              <span>❌ {error}</span>
            </div>
          )}

          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/')}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              id="btn-create-activity"
            >
              {loading ? 'Criando...' : 'Próximo → Enviar Respostas'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
