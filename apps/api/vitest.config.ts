import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/test-database.js';

// Locally DATABASE_URL comes from .env; in CI it's set by the workflow.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // No .env file.
}

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    setupFiles: ['./test/setup.ts'],
    // All test files share one database, so run them one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      BETTER_AUTH_URL: 'http://localhost:5173',
      BETTER_AUTH_SECRET: 'test-only-secret-that-is-at-least-32-characters',
    },
  },
});
