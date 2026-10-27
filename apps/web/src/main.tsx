import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';
import { queryClient } from './api/queryClient';
import { AuthGate } from './features/auth/AuthGate';
import { DeviceApproval } from './features/auth/DeviceApproval';

// No router: /device is the only other page (where `devlib login` sends the user), so check the path.
const isDevicePage = window.location.pathname === '/device';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>{(user) => (isDevicePage ? <DeviceApproval user={user} /> : <App user={user} />)}</AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);
