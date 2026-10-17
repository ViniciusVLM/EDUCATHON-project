// Setup global para os testes do cliente — importa matchers do jest-dom para vitest
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Máquinas de CI podem ser lentas: dá até 3 s para findBy/waitFor antes de falhar,
// evitando falsos negativos em testes de navegação da tela de revisão.
configure({ asyncUtilTimeout: 3000 });
