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
      setError(err instanceof Error ? err.message : 'Erro ao carregar turmas.');
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
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes da turma.');
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
      setError(err instanceof Error ? err.message : 'Erro ao criar turma.');
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
      setError(err instanceof Error ? err.message : 'Erro ao excluir turma.');
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
      setError(err instanceof Error ? err.message : 'Erro ao adicionar aluno.');
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
      setError(err instanceof Error ? err.message : 'Erro ao adicionar alunos em lote.');
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
      setError(err instanceof Error ? err.message : 'Erro ao remover aluno.');
    }
  }

  return (
    <div className="page-container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 className="page-title">🏫 Gestão de Turmas e Alunos</h2>
          <p className="page-subtitle">
            Organize suas turmas para vincular em atividades e casar respostas automaticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateClass(!showCreateClass)}
          className="btn btn-primary"
        >
          {showCreateClass ? 'Cancelar' : '+ Nova Turma'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md, 8px)',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            fontSize: '0.9rem',
            marginBottom: '1rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md, 8px)',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#34d399',
            fontSize: '0.9rem',
            marginBottom: '1rem',
          }}
        >
          ✅ {successMessage}
        </div>
      )}

      {/* Card de Criação de Turma */}
      {showCreateClass && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Criar Nova Turma</h3>
          <form onSubmit={handleCreateClass} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="input-group" style={{ flex: '2', minWidth: '220px' }}>
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
            <div className="input-group" style={{ flex: '1', minWidth: '120px' }}>
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
            <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: '120px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creatingClass || !newClassName.trim()}
                style={{ width: '100%', height: '42px' }}
              >
                {creatingClass ? 'Salvando...' : 'Salvar Turma'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selectedClass ? '1fr 1.3fr' : '1fr', gap: '1.5rem' }}>
        {/* Lista de Turmas */}
        <div>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📚 Suas Turmas</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>({classes.length})</span>
          </h3>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
              <p style={{ color: 'var(--color-text-muted)' }}>Carregando turmas...</p>
            </div>
          ) : classes.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏫</p>
              <h4 style={{ marginBottom: '0.5rem' }}>Nenhuma turma cadastrada</h4>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Crie sua primeira turma para gerenciar alunos e facilitar correções.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateClass(true)}
                className="btn btn-primary btn-sm"
              >
                Criar Turma Agora
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {classes.map((cls) => {
                const isSelected = selectedClass?.id === cls.id;
                return (
                  <div
                    key={cls.id}
                    className="card"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1rem 1.25rem',
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--color-primary, #6366f1)' : undefined,
                      backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.08)' : undefined,
                      transition: 'all 0.2s ease',
                    }}
                    onClick={() => handleSelectClass(cls.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{cls.name}</span>
                        {cls.school_year && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            {cls.school_year}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                        👥 {cls.student_count || 0} aluno{cls.student_count === 1 ? '' : 's'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleSelectClass(cls.id)}
                        className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                      >
                        {isSelected ? 'Visualizando' : 'Alunos'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClass(cls.id, cls.name)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#ef4444' }}
                        title="Excluir turma"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalhes da Turma Selecionada & Gestão de Alunos */}
        {selectedClass && (
          <div className="card animate-fade-in" style={{ alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  Alunos: {selectedClass.name}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Total: {selectedClass.students?.length || 0} estudante(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClass(null)}
                className="btn btn-ghost btn-sm"
              >
                Fechar
              </button>
            </div>

            {/* Painel de Adicionar Alunos */}
            <div
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                padding: '1rem',
                borderRadius: 'var(--radius-md, 8px)',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setAddMode('single')}
                  className={`btn btn-sm ${addMode === 'single' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Adicionar Individual
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('batch')}
                  className={`btn btn-sm ${addMode === 'batch' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Adicionar em Lote
                </button>
              </div>

              {addMode === 'single' ? (
                <form onSubmit={handleAddSingleStudent} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      className="input"
                      style={{ flex: '1.5', minWidth: '180px' }}
                      placeholder="Nome completo do aluno *"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      required
                    />
                    <input
                      type="email"
                      className="input"
                      style={{ flex: '1', minWidth: '180px' }}
                      placeholder="E-mail (opcional)"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={addingStudent || !studentName.trim()}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {addingStudent ? 'Adicionando...' : '+ Inserir Aluno'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAddBatchStudents} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    Cole a lista de alunos (um por linha). Você pode usar o formato: <code>Nome do Aluno, email@escola.org</code>
                  </p>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Ana Clara, ana@escola.org&#10;Bernardo Silva&#10;Carlos Eduardo, carlos@escola.org"
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                    style={{ resize: 'vertical' }}
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={addingStudent || !batchText.trim()}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {addingStudent ? 'Adicionando...' : 'Adicionar Lista de Alunos'}
                  </button>
                </form>
              )}
            </div>

            {/* Lista de Alunos */}
            <div>
              {selectedClass.students.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', fontSize: '0.9rem' }}>
                  Nenhum aluno matriculado nesta turma ainda.
                </p>
              ) : (
                <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedClass.students.map((student) => (
                    <div
                      key={student.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.6rem 0.85rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        fontSize: '0.9rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{student.name}</div>
                        {student.email && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            ✉️ {student.email}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudent(student.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#ef4444', padding: '0.25rem 0.5rem' }}
                        title="Remover aluno"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
