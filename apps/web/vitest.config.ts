import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component tests run in a simulated browser (jsdom). They never reach the API: each test stubs fetch.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
