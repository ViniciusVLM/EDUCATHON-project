import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login';
import Register from '../pages/Register';
import { AuthProvider } from '../contexts/AuthContext';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  loginTeacher: vi.fn(),
  registerTeacher: vi.fn(),
  getMe: vi.fn(),
  getAuthToken: vi.fn(() => null),
  setAuthToken: vi.fn(),
}));

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza os campos de e-mail, senha e botão de entrar', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Acesso do Professor/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar na Plataforma/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cadastre-se como professor/i })).toBeInTheDocument();
  });

  it('chama loginTeacher com as credenciais corretas', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      message: 'Sucesso',
      teacher: { id: 1, name: 'Prof. Carlos', email: 'carlos@escola.org' },
      token: 'jwt-token-123',
    };
    vi.mocked(api.loginTeacher).mockResolvedValueOnce(mockResponse);

    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/E-mail/i), 'carlos@escola.org');
    await user.type(screen.getByLabelText(/Senha/i), 'senha123');
    await user.click(screen.getByRole('button', { name: /Entrar na Plataforma/i }));

    expect(api.loginTeacher).toHaveBeenCalledWith({
      email: 'carlos@escola.org',
      password: 'senha123',
    });
  });

  it('exibe mensagem de erro quando as credenciais são inválidas', async () => {
    const user = userEvent.setup();
    vi.mocked(api.loginTeacher).mockRejectedValueOnce(new Error('E-mail ou senha incorretos.'));

    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/E-mail/i), 'errado@escola.org');
    await user.type(screen.getByLabelText(/Senha/i), 'senhaErrada');
    await user.click(screen.getByRole('button', { name: /Entrar na Plataforma/i }));

    expect(await screen.findByText(/E-mail ou senha incorretos/i)).toBeInTheDocument();
  });
});

describe('Register Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza os campos de cadastro do professor', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Cadastro de Professor/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome Completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^E-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Senha \(mínimo 8 caracteres\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirme sua Senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Criar Conta de Professor/i })).toBeInTheDocument();
  });

  it('valida se a senha tem pelo menos 8 caracteres', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Nome Completo/i), 'Profa. Clara');
    await user.type(screen.getByLabelText(/^E-mail/i), 'clara@escola.org');
    await user.type(screen.getByLabelText(/Senha \(mínimo 8 caracteres\)/i), 'curta');
    await user.type(screen.getByLabelText(/Confirme sua Senha/i), 'curta');
    await user.click(screen.getByRole('button', { name: /Criar Conta de Professor/i }));

    expect(await screen.findByText(/A senha deve ter no mínimo 8 caracteres/i)).toBeInTheDocument();
    expect(api.registerTeacher).not.toHaveBeenCalled();
  });

  it('valida se as senhas coincidem antes de enviar', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Nome Completo/i), 'Profa. Clara');
    await user.type(screen.getByLabelText(/^E-mail/i), 'clara@escola.org');
    await user.type(screen.getByLabelText(/Senha \(mínimo 8 caracteres\)/i), 'senha1234');
    await user.type(screen.getByLabelText(/Confirme sua Senha/i), 'senhaDiferente');
    await user.click(screen.getByRole('button', { name: /Criar Conta de Professor/i }));

    expect(await screen.findByText(/As senhas digitadas não coincidem/i)).toBeInTheDocument();
    expect(api.registerTeacher).not.toHaveBeenCalled();
  });
});
