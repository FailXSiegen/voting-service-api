import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', '_obsolete/**', 'migrations/**', 'scripts/**'] },
  js.configs.recommended,
  prettier,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      semi: [2, 'always'],
      'no-multiple-empty-lines': [2, { max: 1, maxEOF: 0 }],

      // Quality rules (equivalent to PHPMD)
      complexity: ['warn', 20],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 5],
      'max-nested-callbacks': ['warn', 4],
      'no-duplicate-imports': 'error',
      // New defaults since ESLint 9, kept lenient so legacy catch blocks stay valid.
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-useless-assignment': 'warn',
    },
  },
];
