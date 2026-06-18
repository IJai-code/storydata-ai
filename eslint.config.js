import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['public/js/render/kinetic-engine.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: globals.browser,
    },
  },
  {
    files: ['public/js/**/*.js', 'server/gated/**/*.js'],
    ignores: ['public/js/render/kinetic-engine.js'],
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
    ignores: ['node_modules/**'],
  },
];
