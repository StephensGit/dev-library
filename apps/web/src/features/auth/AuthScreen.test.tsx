import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';

type ConfigResponse = { signupEnabled: boolean } | 'error' | 'pending';

// Stubs GET /api/config. Each test gets a fresh query client with the app's defaults, so the config query's
// own retry setting is what's tested.
function renderAuthScreen(path: string, ...responses: ConfigResponse[]) {
  window.history.replaceState(null, '', path);

  const fetchMock = vi.fn(async () => {
    const next = responses.length > 1 ? responses.shift()! : responses[0];

    if (next === 'pending') {
      return new Promise<Response>(() => {});
    }

    return next === 'error'
      ? new Response(JSON.stringify({ message: 'Internal Server Error' }), { status: 500 })
      : new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);

  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthScreen />
    </QueryClientProvider>,
  );

  return fetchMock;
}

const createAccountLink = () => screen.queryByRole('button', { name: 'Create an account' });
const registerHeading = () => screen.queryByRole('heading', { name: 'Create your account' });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('log in page', () => {
  it('offers registration when sign-up is open, and opens the form at /register', async () => {
    const fetchMock = renderAuthScreen('/', { signupEnabled: true });

    await userEvent.click(await screen.findByRole('button', { name: 'Create an account' }));

    expect(registerHeading()).not.toBeNull();
    expect(window.location.pathname).toBe('/register');
    expect(fetchMock).toHaveBeenCalledWith('/api/config', expect.anything());

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('heading', { name: 'Log in' })).not.toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  it('hides registration when sign-up is closed', async () => {
    const fetchMock = renderAuthScreen('/', { signupEnabled: false });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await screen.findByRole('heading', { name: 'Log in' });
    // Let the response settle before checking nothing appeared.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createAccountLink()).toBeNull();
  });

  it.each([
    ['still loading', 'pending'],
    ['unavailable', 'error'],
  ] as const)('hides registration while the config is %s', async (_label, response) => {
    renderAuthScreen('/', response);

    await screen.findByRole('heading', { name: 'Log in' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createAccountLink()).toBeNull();
  });
});

describe('opening /register directly', () => {
  it('shows the form when sign-up is open', async () => {
    renderAuthScreen('/register', { signupEnabled: true });

    expect(await screen.findByRole('heading', { name: 'Create your account' })).not.toBeNull();
  });

  it('says registration is closed, with a way to log in', async () => {
    renderAuthScreen('/register', { signupEnabled: false });

    await screen.findByRole('heading', { name: 'Registration is currently closed' });
    expect(registerHeading()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('heading', { name: 'Log in' })).not.toBeNull();
    expect(createAccountLink()).toBeNull();
    // A refresh now opens the login form, not registration.
    expect(window.location.pathname).toBe('/');
  });

  it('shows neither the form nor a decision while loading', async () => {
    renderAuthScreen('/register', 'pending');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText('Checking whether registration is open')).not.toBeNull();
    expect(registerHeading()).toBeNull();
  });

  it('does not show the form if the config request fails, and can retry', async () => {
    const fetchMock = renderAuthScreen('/register', 'error', { signupEnabled: true });

    // Shown after a single attempt: the config query doesn't retry by itself (the default waits ~7 seconds).
    await screen.findByRole('heading', { name: "Couldn't check registration" }, { timeout: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(registerHeading()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Create your account' })).not.toBeNull();
  });
});

describe('the CLI login page (/device) while logged out', () => {
  it('keeps its URL when switching forms, so it opens again after logging in', async () => {
    renderAuthScreen('/device', { signupEnabled: true });

    await userEvent.click(await screen.findByRole('button', { name: 'Create an account' }));
    expect(window.location.pathname).toBe('/device');

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(window.location.pathname).toBe('/device');
  });
});
