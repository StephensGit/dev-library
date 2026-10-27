import { chmod, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearCredentials,
  credentialsDir,
  credentialsPath,
  loadCredentials,
  saveCredentials,
  type Credentials,
} from '../src/credentials.js';
import { requireCredentials } from '../src/session.js';

const credentials: Credentials = {
  apiUrl: 'http://localhost:3000',
  sessionToken: 'session-token-for-tests',
  user: { name: 'Alice', email: 'alice@example.test' },
};

let root: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devlib-credentials-'));
  env = { XDG_CONFIG_HOME: root };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const mode = async (path: string) => (await stat(path)).mode & 0o777;

describe('where credentials live', () => {
  it('uses $XDG_CONFIG_HOME/devlib', () => {
    expect(credentialsPath(env)).toBe(join(root, 'devlib', 'credentials.json'));
  });

  it('falls back to ~/.config/devlib, ignoring a relative XDG_CONFIG_HOME', () => {
    expect(credentialsDir({ XDG_CONFIG_HOME: 'relative/path' })).toMatch(/\.config[/\\]devlib$/);
    expect(credentialsDir({})).toMatch(/\.config[/\\]devlib$/);
  });
});

describe('saving and loading', () => {
  it('round-trips the login', async () => {
    await saveCredentials(credentials, env);

    expect(await loadCredentials(env)).toEqual(credentials);
  });

  it('returns null when nobody is logged in', async () => {
    expect(await loadCredentials(env)).toBeNull();
  });

  it('creates a private directory and file', async () => {
    await saveCredentials(credentials, env);

    expect(await mode(credentialsDir(env))).toBe(0o700);
    expect(await mode(credentialsPath(env))).toBe(0o600);
  });

  it('leaves no temporary files behind and replaces the old login', async () => {
    await saveCredentials(credentials, env);
    await saveCredentials({ ...credentials, sessionToken: 'second-token' }, env);

    expect(await readdir(credentialsDir(env))).toEqual(['credentials.json']);
    expect((await loadCredentials(env))?.sessionToken).toBe('second-token');
    expect(await mode(credentialsPath(env))).toBe(0o600);
  });

  it('tightens a directory that others can read', async () => {
    await mkdir(credentialsDir(env), { mode: 0o755 });
    await chmod(credentialsDir(env), 0o755);

    await saveCredentials(credentials, env);

    expect(await mode(credentialsDir(env))).toBe(0o700);
  });

  it('clears the login, and clearing twice is fine', async () => {
    await saveCredentials(credentials, env);

    await clearCredentials(env);
    await clearCredentials(env);

    expect(await loadCredentials(env)).toBeNull();
  });
});

describe('unsafe credential files', () => {
  it('refuses a file other users can read', async () => {
    await saveCredentials(credentials, env);
    await chmod(credentialsPath(env), 0o644);

    await expect(loadCredentials(env)).rejects.toThrow(/can be read by other users/);
  });

  it('refuses to follow a symlink in place of the file', async () => {
    const elsewhere = join(root, 'elsewhere.json');
    await saveCredentials(credentials, env);
    await rm(credentialsPath(env));
    await writeFile(elsewhere, JSON.stringify({ version: 1, ...credentials }), { mode: 0o600 });
    await symlink(elsewhere, credentialsPath(env));

    await expect(loadCredentials(env)).rejects.toThrow(/symlink/);
  });

  it('replaces a symlink on save instead of writing through it', async () => {
    const target = join(root, 'target.json');
    await writeFile(target, 'untouched');
    await mkdir(credentialsDir(env), { mode: 0o700 });
    await symlink(target, credentialsPath(env));

    await saveCredentials(credentials, env);

    expect(await loadCredentials(env)).toEqual(credentials);
    expect((await stat(target)).size).toBe('untouched'.length);
  });

  it('refuses a symlinked directory', async () => {
    const realDir = join(root, 'real');
    await mkdir(realDir, { mode: 0o700 });
    await symlink(realDir, credentialsDir(env));

    await expect(saveCredentials(credentials, env)).rejects.toThrow(/not a regular directory/);
    await expect(loadCredentials(env)).rejects.toThrow(/not a regular directory/);
  });

  it('refuses a damaged file', async () => {
    await mkdir(credentialsDir(env), { mode: 0o700 });
    await writeFile(credentialsPath(env), '{"version":1,"apiUrl":', { mode: 0o600 });

    await expect(loadCredentials(env)).rejects.toThrow(/damaged/);
  });
});

describe('which API a login is used with', () => {
  it('uses the login with the API it came from', async () => {
    await saveCredentials(credentials, env);

    expect(await requireCredentials({ ...env, DEVLIB_API_URL: 'http://localhost:3000/' })).toEqual(credentials);
  });

  it('never uses a login with a different API', async () => {
    await saveCredentials(credentials, env);

    await expect(requireCredentials({ ...env, DEVLIB_API_URL: 'https://devlib.example.com' })).rejects.toThrow(
      /logged in to http:\/\/localhost:3000, but DEVLIB_API_URL is https:\/\/devlib.example.com/,
    );
  });

  it('asks the user to log in when there is no login', async () => {
    await expect(requireCredentials(env)).rejects.toThrow(/not logged in/);
  });
});
