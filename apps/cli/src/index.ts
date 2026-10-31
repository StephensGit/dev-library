#!/usr/bin/env node

import { Command } from 'commander';
import { ApiUnreachableError, apiRequest, readJson } from './api.js';
import { openBrowser } from './browser.js';
import { apiUrlFromEnv } from './config.js';
import { clearCredentials, loadCredentials, saveCredentials, type Credentials } from './credentials.js';
import { deviceLogin, formatUserCode } from './device-login.js';
import { CliError } from './errors.js';
import { fetchSessionUser, requireCredentials, revokeSession, sessionEnded } from './session.js';

type Tag = {
  id: number;
  name: string;
};

type DevCommand = {
  id: number;
  title: string;
  command: string;
  description: string | null;
  tags: Tag[];
};

async function fetchCommands(search?: string): Promise<DevCommand[]> {
  const { apiUrl, sessionToken } = await requireCredentials();
  const path = search ? `/api/commands?search=${encodeURIComponent(search)}` : '/api/commands';
  const response = await apiRequest(apiUrl, path, { sessionToken });

  if (response.status === 401) {
    return sessionEnded();
  }

  if (!response.ok) {
    throw new CliError(`The Dev Library API at ${apiUrl} returned status ${response.status}.`);
  }

  return readJson<DevCommand[]>(apiUrl, response);
}

function printCommands(commands: DevCommand[]) {
  if (commands.length === 0) {
    console.log('No commands found.');
    return;
  }

  for (const command of commands) {
    const tags = command.tags.map((tag) => tag.name).join(', ');

    console.log(command.title);
    console.log(`  ${command.command}`);

    if (tags) {
      console.log(`  Tags: ${tags}`);
    }

    console.log();
  }
}

// A saved login that can't be read (damaged, or unsafe permissions) is treated as no login.
async function loadCredentialsIfReadable(): Promise<Credentials | null> {
  try {
    return await loadCredentials();
  } catch (error) {
    if (error instanceof CliError) {
      return null;
    }
    throw error;
  }
}

async function login(options: { force?: boolean; browser: boolean }) {
  const apiUrl = apiUrlFromEnv();
  const existing = await loadCredentialsIfReadable();

  if (existing?.apiUrl === apiUrl && !options.force) {
    const user = await fetchSessionUser(apiUrl, existing.sessionToken);

    if (user) {
      console.log(`Already logged in as ${user.name} (${user.email}).`);
      console.log('Run devlib login --force to log in again.');
      return;
    }
  }

  // Ctrl-C stops waiting for approval; the unused code simply expires on the server.
  const cancel = new AbortController();
  const onInterrupt = () => cancel.abort();
  process.once('SIGINT', onInterrupt);

  let sessionToken: string;
  try {
    sessionToken = await deviceLogin({
      apiUrl,
      signal: cancel.signal,
      onCode: async (code) => {
        console.log('To log in, open this page and check that it shows the same code:');
        console.log();
        console.log(`  ${code.verificationUriComplete}`);
        console.log();
        console.log(`  Code: ${formatUserCode(code.userCode)}`);
        console.log();

        const opened = options.browser && (await openBrowser(code.verificationUriComplete));
        const minutes = Math.round(code.expiresIn / 60);
        console.log(
          `${opened ? 'Opened your browser. ' : ''}Waiting for approval (expires in ${minutes} minutes, Ctrl-C to cancel)…`,
        );
      },
    });
  } finally {
    process.removeListener('SIGINT', onInterrupt);
  }

  const user = await fetchSessionUser(apiUrl, sessionToken);

  if (!user) {
    throw new CliError(
      'Login was approved, but the API did not accept the new session. Run devlib login to try again.',
    );
  }

  // Replace any earlier login (another API, --force, or a second `devlib login` that finished first),
  // ending its session so it doesn't linger. Each token only goes to the API it came from.
  const previous = await loadCredentialsIfReadable();
  await saveCredentials({ apiUrl, sessionToken, user });

  if (previous && previous.sessionToken !== sessionToken) {
    await revokeSession(previous.apiUrl, previous.sessionToken).catch(() => {});
  }

  console.log(`Logged in as ${user.name} (${user.email}).`);
}

async function logout() {
  let credentials: Credentials | null;

  try {
    credentials = await loadCredentials();
  } catch (error) {
    if (!(error instanceof CliError)) {
      throw error;
    }
    await clearCredentials();
    console.warn('Removed the saved login. It could not be read, so its session was not ended on the server;');
    console.warn('it will expire on its own within 7 days.');
    return;
  }

  if (!credentials) {
    console.log("You're not logged in.");
    return;
  }

  let warning: string | null = null;

  try {
    await revokeSession(credentials.apiUrl, credentials.sessionToken);
  } catch (error) {
    if (!(error instanceof CliError)) {
      throw error;
    }
    warning =
      error instanceof ApiUnreachableError
        ? `Could not reach the Dev Library API at ${credentials.apiUrl} to end the session.`
        : error.message;
  }

  // Forget the token locally whatever happened on the server.
  await clearCredentials();

  if (warning) {
    console.warn(warning);
    console.warn('Removed the saved login from this computer, but the session may stay active on the server');
    console.warn('until it expires (within 7 days).');
    process.exitCode = 1;
    return;
  }

  console.log('Logged out.');
}

async function whoami() {
  const { apiUrl, sessionToken } = await requireCredentials();
  const user = await fetchSessionUser(apiUrl, sessionToken);

  if (!user) {
    return sessionEnded();
  }

  console.log(`${user.name} (${user.email})`);
  console.log(`API: ${apiUrl}`);
}

const program = new Command();

program.name('devlib').description('Dev Library CLI').version('0.1.0');

program
  .command('login')
  .description('Log in by approving this computer in the Dev Library web app')
  .option('--force', 'log in again even if already logged in')
  .option('--no-browser', 'print the login link instead of opening it')
  .action(login);

program.command('logout').description('Log out and end this computer’s session').action(logout);

program.command('whoami').description('Show who you are logged in as').action(whoami);

program
  .command('list')
  .description('List saved commands')
  .action(async () => {
    const commands = await fetchCommands();
    printCommands(commands);
  });

program
  .command('search')
  .description('Search saved commands')
  .argument('<query>', 'Search term')
  .action(async (query: string) => {
    const commands = await fetchCommands(query);
    printCommands(commands);
  });

// Expected problems (not logged in, API down, denied login…) print a message; anything else is a bug.
program.parseAsync().catch((error: unknown) => {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = error.exitCode;
    return;
  }

  console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
