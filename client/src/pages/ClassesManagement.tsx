import { useState, useEffect, FormEvent } from 'react';
import type { Class, ClassWithStudents } from '../types';
import {
  getClasses,
  getClass,
  createClass,
  deleteClass,
  addStudent,
  addStudentsBatch,
  deleteStudent,
} from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { IconPlus, IconAlertCircle, IconCheckCircle } from '../components/ui/Icons';

export default function ClassesManagement() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassWithStudents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Formulário de criação de turma
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassYear, setNewClassYear] = useState(new Date().getFullYear().toString());
  const [creatingClass, setCreatingClass] = useState(false);

  // Formulário de inclusão de aluno
  const [addMode, setAddMode] = useState<'single' | 'batch'>('single');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [batchText, setBatchText] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    setLoading(true);
    setError('');
    try {
      const data = await getClasses();
      setClasses(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectClass(id: number) {
    setError('');
    setSuccessMessage('');
    try {
      const data = await getClass(id);
      setSelectedClass(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
      );
    }
  }

  async function handleCreateClass(e: FormEvent) {
    e.preventDefault();
    if (!newClassName.trim()) return;

    setCreatingClass(true);
    setError('');
    try {
      await createClass({
        name: newClassName.trim(),
        schoolYear: newClassYear.trim() || undefined,
      });
      setNewClassName('');
      setShowCreateClass(false);
      setSuccessMessage('Turma criada com sucesso!');
      await loadClasses();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
      );
    } finally {
      setCreatingClass(false);
    }
  }

  async function handleDeleteClass(id: number, name: string) {
    if (!window.confirm(`Tem certeza que deseja excluir a turma "${name}"?`)) return;

    try {
      await deleteClass(id);
      if (selectedClass?.id === id) {
        setSelectedClass(null);
      }
      setSuccessMessage('Turma excluída com sucesso!');
      await loadClasses();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
      );
    }
  }

  async function handleAddSingleStudent(e: FormEvent) {
    e.preventDefault();
    if (!selectedClass || !studentName.trim()) return;

    setAddingStudent(true);
    setError('');
    try {
      await addStudent(selectedClass.id, {
        name: studentName.trim(),
        email: studentEmail.trim() || undefined,
      });
      setStudentName('');
      setStudentEmail('');
      setSuccessMessage('Aluno adicionado com sucesso!');
      await handleSelectClass(selectedClass.id);
      await loadClasses();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
      );
    } finally {
      setAddingStudent(false);
    }
  }

  async function handleAddBatchStudents(e: FormEvent) {
    e.preventDefault();
    if (!selectedClass || !batchText.trim()) return;

    setAddingStudent(true);
    setError('');

    // Linhas: "Nome, email@exemplo.com" ou apenas "Nome"
    const lines = batchText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsedStudents = lines.map((line) => {
      const parts = line.split(/[,;\t]/);
      const name = parts[0].trim();
      const email = parts[1] ? parts[1].trim() : undefined;
      return { name, email };
    });

    try {
      const res = await addStudentsBatch(selectedClass.id, parsedStudents);
      setBatchText('');
      setSuccessMessage(`${res.count} alunos adicionados com sucesso!`);
      await handleSelectClass(selectedClass.id);
      await loadClasses();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
      );
    } finally {
      setAddingStudent(false);
    }
  }

  async function handleDeleteStudent(studentId: number) {
    if (!selectedClass) return;

    try {
      await deleteStudent(selectedClass.id, studentId);
      await handleSelectClass(selectedClass.id);
      await loadClasses();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
      );
    }
  }

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">🏫 Gestão de Turmas e Alunos</h2>
          <p className="page-subtitle">
            Organize suas turmas para vincular em atividades e casar respostas automaticamente.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => setShowCreateClass(!showCreateClass)}
          icon={!showCreateClass ? <IconPlus size={18} /> : undefined}
        >
          {showCreateClass ? 'Cancelar' : '+ Nova Turma'}
        </Button>
      </div>

      {error && (
        <div className="alert-box alert-box--error" role="alert">
          <IconAlertCircle size={18} />
          <span>⚠️ {error}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert-box alert-box--success" role="status">
          <IconCheckCircle size={18} />
          <span>✅ {successMessage}</span>
        </div>
      )}

      {/* Card de Criação de Turma */}
      {showCreateClass && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
            Criar Nova Turma
          </h3>
          <form onSubmit={handleCreateClass} className="classes-form-inline">
            <div className="input-group input-group--name">
              <label className="input-label" htmlFor="newClassName">
                Nome da Turma *
              </label>
              <input
                id="newClassName"
                type="text"
                className="input"
                placeholder="Ex: 9º Ano B — Matutino"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                required
              />
            </div>
            <div className="input-group input-group--year">
              <label className="input-label" htmlFor="newClassYear">
                Ano Letivo
              </label>
              <input
                id="newClassYear"
                type="text"
                className="input"
                placeholder="Ex: 2026"
                value={newClassYear}
                onChange={(e) => setNewClassYear(e.target.value)}
              />
            </div>
            <div className="input-group input-group--action">
              <Button
                type="submit"
                variant="primary"
                loading={creatingClass}
                disabled={creatingClass || !newClassName.trim()}
              >
                {creatingClass ? 'Salvando...' : 'Salvar Turma'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className={`classes-grid ${selectedClass ? 'classes-grid--split' : ''}`}>
        {/* Lista de Turmas */}
        <div>
          <div className="page-header-row" style={{ marginBottom: 'var(--space-3)' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>📚 Suas Turmas</span>
              <span className="classes-header-count">({classes.length})</span>
            </h3>
          </div>

          {loading ? (
            <div className="page-container--center">
              <div className="spinner spinner-lg" />
            </div>
          ) : classes.length === 0 ? (
            <Card className="empty-state">
              <div className="empty-state-icon">🏫</div>
              <h3 className="empty-state-title">Nenhuma turma cadastrada</h3>
              <p className="empty-state-text">
                Crie sua primeira turma para gerenciar alunos e facilitar correções.
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setShowCreateClass(true)}
                icon={<IconPlus size={16} />}
              >
                Criar Turma Agora
              </Button>
            </Card>
          ) : (
            <div className="classes-list">
              {classes.map((cls) => {
                const isSelected = selectedClass?.id === cls.id;
                return (
                  <div
                    key={cls.id}
                    className={`class-card ${isSelected ? 'class-card--selected' : ''}`}
                    onClick={() => handleSelectClass(cls.id)}
                  >
                    <div>
                      <div className="class-card__title-row">
                        <span>{cls.name}</span>
                        {cls.school_year && (
                          <Chip variant="purple" size="sm">
                            {cls.school_year}
                          </Chip>
                        )}
                      </div>
                      <div className="class-card__meta">
                        👥 {cls.student_count || 0} aluno{cls.student_count === 1 ? '' : 's'}
                      </div>
                    </div>

                    <div className="table-actions" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? 'primary' : 'ghost'}
                        onClick={() => handleSelectClass(cls.id)}
                      >
                        {isSelected ? 'Visualizando' : 'Alunos'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteClass(cls.id, cls.name)}
                        title="Excluir turma"
                        style={{ color: 'var(--error-500)' }}
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalhes da Turma Selecionada & Gestão de Alunos */}
        {selectedClass && (
          <Card className="students-panel animate-fade-in">
            <div className="students-panel__header">
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>
                  Alunos: {selectedClass.name}
                </h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Total: {selectedClass.students?.length || 0} estudante(s)
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedClass(null)}
              >
                Fechar
              </Button>
            </div>

            {/* Painel de Adicionar Alunos */}
            <div className="students-panel__add-box">
              <div className="filter-tabs" style={{ marginBottom: 'var(--space-3)' }}>
                <button
                  type="button"
                  onClick={() => setAddMode('single')}
                  className={`filter-tab ${addMode === 'single' ? 'active' : ''}`}
                >
                  Adicionar Individual
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('batch')}
                  className={`filter-tab ${addMode === 'batch' ? 'active' : ''}`}
                >
                  Adicionar em Lote
                </button>
              </div>

              {addMode === 'single' ? (
                <form onSubmit={handleAddSingleStudent} className="form-grid">
                  <div className="form-row">
                    <input
                      type="text"
                      className="input"
                      placeholder="Nome completo do aluno *"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      required
                    />
                    <input
                      type="email"
                      className="input"
                      placeholder="E-mail (opcional)"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={addingStudent}
                      disabled={addingStudent || !studentName.trim()}
                    >
                      {addingStudent ? 'Adicionando...' : '+ Inserir Aluno'}
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleAddBatchStudents} className="form-grid">
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
                    Cole a lista de alunos (um por linha). Formato: <code>Nome do Aluno, email@escola.org</code>
                  </p>
                  <textarea
                    className="textarea"
                    rows={4}
                    placeholder="Ana Clara, ana@escola.org&#10;Bernardo Silva&#10;Carlos Eduardo, carlos@escola.org"
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                    required
                  />
                  <div>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={addingStudent}
                      disabled={addingStudent || !batchText.trim()}
                    >
                      {addingStudent ? 'Adicionando...' : 'Adicionar Lista de Alunos'}
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Lista de Alunos */}
            <div>
              {selectedClass.students.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6) 0', fontSize: 'var(--text-sm)' }}>
                  Nenhum aluno matriculado nesta turma ainda.
                </p>
              ) : (
                <div className="students-list">
                  {selectedClass.students.map((student) => (
                    <div key={student.id} className="student-row">
                      <div>
                        <div className="student-row__name">{student.name}</div>
                        {student.email && (
                          <div className="student-row__email">
                            ✉️ {student.email}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteStudent(student.id)}
                        title="Remover aluno"
                        style={{ color: 'var(--error-500)', padding: 'var(--space-1) var(--space-2)' }}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
