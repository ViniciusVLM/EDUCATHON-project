// eslint.config.js — Server (ESM, Node 22+)
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Erros reais
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // servidor usa console livremente
      'no-undef': 'error',
      'no-duplicate-imports': 'error',

      // Qualidade
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    // Relaxa regras nos arquivos de teste
    files: ['src/__tests__/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
