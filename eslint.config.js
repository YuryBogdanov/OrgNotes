// ESLint (tech sprint 6.3): the recommended rules of JS, TypeScript and Svelte; no formatting rules (the code keeps its
// own style). `npm run lint`; CI runs it with the checks.
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
  { ignores: ['dist/', 'dist-release/', 'src-tauri/', 'node_modules/', 'sample-notes/', 'test-results/', 'playwright-report/', '.svelte-check/', 'docs/', 'templates/'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // JSON, the plugins' bridge and the tests' fixtures are `any` on purpose
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // `a && b()`, `(a(), b())`, a dependency read for an effect (`tick;`): the code's idioms
      '@typescript-eslint/no-unused-expressions': 'off',
      // \u0000 marks the places of pieces taken out of a text (links, code) while it is escaped
      'no-control-regex': 'off',
      // a Map or a Set inside a function is not state; the rule cannot tell
      'svelte/prefer-svelte-reactivity': 'off',
      // a list drawn once, or by index on purpose
      'svelte/require-each-key': 'off',
      // `{' '}`: a space between two inline elements, said on purpose
      'svelte/no-useless-mustaches': 'off',
    },
  },
  // ТЗ 42 §2: the new interface grows beside the old one. `src/next/` takes any module of `src/` (`.ts`, `.svelte.ts` —
  // imported as `../store.svelte`) but no component of the old interface (a capital name: `../Settings.svelte`) — none
  // at all since ТЗ 54.8, the bridges gone; the old code never imports `next/` (the entry, main.ts, chooses the shell).
  {
    files: ['src/next/**/*.ts', 'src/next/**/*.svelte'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: '^(\\.\\./)+(?:[^/]+/)*[A-Z][^/]*\\.svelte$', caseSensitive: true, message: 'Компонент старого интерфейса в новом не используется (ТЗ 42 §2, ТЗ 54 §5).' }] }],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    ignores: ['src/next/**', 'src/main.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: '(^|/)next/', message: 'Старый интерфейс не импортирует src/next/ (ТЗ 42 §2).' }] }],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'], svelteConfig } },
  },
);
