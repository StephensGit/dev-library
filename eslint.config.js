import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['**/dist', '**/coverage', 'packages/db/drizzle']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['apps/api/**/*.ts', 'apps/cli/**/*.ts', 'packages/db/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Last, so it switches off any rule that would conflict with Prettier.
  prettier,
]);
