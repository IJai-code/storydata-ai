import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['js/render/kinetic-engine.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: globals.browser,
    },
  },
  {
    files: ['js/**/*.js', 'server/gated/**/*.js'],
    ignores: ['js/render/kinetic-engine.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['server/**/*.js', 'eslint.config.js'],
    ignores: ['server/gated/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Local-only Node tooling: the preview server and the golden-test runner.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    ignores: ['node_modules/**'],
  },
];
