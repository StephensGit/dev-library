import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';
import { queryClient } from './api/queryClient';
import { AuthGate } from './features/auth/AuthGate';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>{(user) => <App user={user} />}</AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);
