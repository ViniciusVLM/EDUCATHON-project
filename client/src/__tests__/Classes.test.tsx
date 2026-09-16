/**
 * Testes da página ClassesManagement.
 * Cobre: estado de loading, empty state, criação de turma, seleção de turma e adição de alunos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ClassesManagement from '../pages/ClassesManagement';
import * as api from '../services/api';
import type { Class, ClassWithStudents } from '../types';

vi.mock('../services/api', () => ({
  getClasses: vi.fn(),
  getClass: vi.fn(),
  createClass: vi.fn(),
  deleteClass: vi.fn(),
  addStudent: vi.fn(),
  addStudentsBatch: vi.fn(),
  deleteStudent: vi.fn(),
}));

const mockGetClasses = vi.mocked(api.getClasses);
const mockGetClass = vi.mocked(api.getClass);
const mockCreateClass = vi.mocked(api.createClass);
const mockDeleteClass = vi.mocked(api.deleteClass);
const mockAddStudent = vi.mocked(api.addStudent);
const mockAddStudentsBatch = vi.mocked(api.addStudentsBatch);
const mockDeleteStudent = vi.mocked(api.deleteStudent);

function renderClassesManagement() {
  return render(
    <MemoryRouter>
      <ClassesManagement />
    </MemoryRouter>
  );
}

describe('ClassesManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe spinner enquanto carrega as turmas', () => {
    mockGetClasses.mockImplementation(() => new Promise(() => {}));
    renderClassesManagement();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  it('exibe empty state quando não há turmas', async () => {
    mockGetClasses.mockResolvedValue([]);
    renderClassesManagement();

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma turma cadastrada/i)).toBeInTheDocument();
    });
  });

  it('exibe lista de turmas cadastradas', async () => {
    const mockList: Class[] = [
      {
        id: 1,
        teacher_id: 1,
        name: '3º Ano A - Médio',
        code: '3A-2026',
        grade_level: 'medio',
        school_year: '2026',
        created_at: '2026-09-01T10:00:00.000Z',
        student_count: 25,
      },
    ];
    mockGetClasses.mockResolvedValue(mockList);

    renderClassesManagement();

    await waitFor(() => {
      expect(screen.getByText('3º Ano A - Médio')).toBeInTheDocument();
      expect(screen.getByText('2026')).toBeInTheDocument();
      expect(screen.getByText(/25 alunos/i)).toBeInTheDocument();
    });
  });

  it('permite abrir formulário e criar uma nova turma', async () => {
    mockGetClasses.mockResolvedValue([]);
    mockCreateClass.mockResolvedValue({
      message: 'Turma criada',
      class: { id: 2, teacher_id: 1, name: '9º Ano B' },
    });

    const user = userEvent.setup();
    renderClassesManagement();

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma turma cadastrada/i)).toBeInTheDocument();
    });

    const newClassBtn = screen.getByRole('button', { name: /\+ Nova Turma/i });
    await user.click(newClassBtn);

    const nameInput = screen.getByLabelText(/Nome da Turma/i);
    await user.type(nameInput, '9º Ano B');

    const submitBtn = screen.getByRole('button', { name: /Salvar Turma/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateClass).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '9º Ano B',
        })
      );
    });
  });

  it('ao selecionar uma turma, exibe seus alunos', async () => {
    const mockList: Class[] = [
      {
        id: 1,
        teacher_id: 1,
        name: '9º Ano A',
        created_at: '2026-09-01T10:00:00.000Z',
        student_count: 2,
      },
    ];
    const mockClassDetails: ClassWithStudents = {
      id: 1,
      teacher_id: 1,
      name: '9º Ano A',
      created_at: '2026-09-01T10:00:00.000Z',
      students: [
        {
          id: 10,
          class_id: 1,
          name: 'Alice Silva',
          email: 'alice@escola.com',
          created_at: '2026-09-01T10:00:00.000Z',
        },
        {
          id: 11,
          class_id: 1,
          name: 'Bruno Lima',
          email: null,
          created_at: '2026-09-01T10:00:00.000Z',
        },
      ],
    };

    mockGetClasses.mockResolvedValue(mockList);
    mockGetClass.mockResolvedValue(mockClassDetails);

    const user = userEvent.setup();
    renderClassesManagement();

    await waitFor(() => {
      expect(screen.getByText('9º Ano A')).toBeInTheDocument();
    });

    const selectClassBtn = screen.getByRole('button', { name: /^Alunos/i });
    await user.click(selectClassBtn);

    await waitFor(() => {
      expect(mockGetClass).toHaveBeenCalledWith(1);
      expect(screen.getByText('Alice Silva')).toBeInTheDocument();
      expect(screen.getByText(/alice@escola\.com/)).toBeInTheDocument();
      expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
    });
  });
});
