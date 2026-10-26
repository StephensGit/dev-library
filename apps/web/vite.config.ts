import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* to the Fastify API so the browser never makes a cross-origin request.
    // The first matching rule wins, so /api/auth must come before /api.
    proxy: {
      // Better Auth lives at /api/auth on the API too, so forward it unchanged.
      '/api/auth': {
        target: 'http://localhost:3000',
      },
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
