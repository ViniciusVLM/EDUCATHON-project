/**
 * Envio de respostas: acessibilidade da área de CSV e erro ao carregar a atividade.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UploadResponses from '../pages/UploadResponses';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  getActivity: vi.fn(),
  previewCSV: vi.fn(),
  uploadCSV: vi.fn(),
  addManualResponses: vi.fn(),
  readAnswerSheets: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/upload/1']}>
      <Routes>
        <Route path="/upload/:activityId" element={<UploadResponses />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('UploadResponses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a área do CSV funciona pelo teclado (Enter abre a escolha do arquivo)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getActivity).mockReturnValue(new Promise(() => {}));
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    renderPage();

    const dropzone = screen.getByRole('button', { name: /Arraste um arquivo CSV/i });
    expect(dropzone).toHaveAttribute('tabindex', '0');
    expect(dropzone).toHaveAccessibleDescription(/Colunas esperadas/);
    dropzone.focus();
    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('abas indicam a opção ativa e os campos manuais têm nome acessível', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getActivity).mockReturnValue(new Promise(() => {}));
    renderPage();
    const manual = screen.getByRole('button', { name: 'Digitar manualmente' });
    expect(manual).toHaveAttribute('aria-pressed', 'false');
    await user.click(manual);
    expect(manual).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Nome do aluno 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Resposta do aluno 1')).toBeInTheDocument();
  });

  it('se a atividade não carrega, a leitura de PDF mostra o erro em vez de carregar para sempre', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getActivity).mockRejectedValue(new Error('Atividade não encontrada.'));
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Ler PDF ou fotos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Atividade não encontrada.');
    expect(screen.queryByText('Carregando a atividade...')).not.toBeInTheDocument();
  });
});
