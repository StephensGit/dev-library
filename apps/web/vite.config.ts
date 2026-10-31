import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* to the Fastify API unchanged, so the browser never makes a cross-origin request.
    // In production Fastify serves the web app itself, so this proxy only exists in development.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
      },
    },
  },
});
