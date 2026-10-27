import { randomBytes } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, rename, unlink, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { CliError } from './errors.js';

// What `devlib login` saves. The token is a Better Auth session token (the same kind the web app keeps in
// its cookie), valid for 7 days and extended while in use. It only ever goes to apiUrl.
export type Credentials = {
  apiUrl: string;
  sessionToken: string;
  user: { name: string; email: string };
};

type StoredCredentials = Credentials & { version: 1 };

const FILE_NAME = 'credentials.json';

// Windows has no POSIX owners or modes; there the file relies on the user profile's permissions.
const checkOwnership = typeof process.getuid === 'function';

// $XDG_CONFIG_HOME/devlib, or ~/.config/devlib. The spec says to ignore a relative XDG_CONFIG_HOME.
export function credentialsDir(env: NodeJS.ProcessEnv = process.env) {
  const configHome = env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : null;
  return join(configHome ?? join(homedir(), '.config'), 'devlib');
}

export function credentialsPath(env: NodeJS.ProcessEnv = process.env) {
  return join(credentialsDir(env), FILE_NAME);
}

function isOwnedByMe(stats: Stats) {
  return !checkOwnership || stats.uid === process.getuid!();
}

function isPrivate(stats: Stats) {
  return !checkOwnership || (stats.mode & 0o077) === 0;
}

// The directory must be a real directory (not a symlink someone could point elsewhere) that we own.
// If it's readable by others, tighten it to 0700 rather than fail.
async function secureDir(dir: string, create: boolean) {
  if (create) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }

  let stats: Stats;
  try {
    stats = await lstat(dir);
  } catch (error) {
    if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new CliError(`${dir} is not a regular directory (is it a symlink?). Remove it, then run devlib login.`);
  }

  if (!isOwnedByMe(stats)) {
    throw new CliError(`${dir} belongs to another user. Remove it, then run devlib login.`);
  }

  if (!isPrivate(stats)) {
    await chmod(dir, 0o700);
  }

  return true;
}

function isCredentials(value: unknown): value is StoredCredentials {
  const data = value as StoredCredentials | null;
  return (
    data?.version === 1 &&
    typeof data.apiUrl === 'string' &&
    typeof data.sessionToken === 'string' &&
    data.sessionToken !== '' &&
    typeof data.user?.name === 'string' &&
    typeof data.user?.email === 'string'
  );
}

// Returns null when nobody is logged in. Refuses (rather than reads) a file that is a symlink,
// owned by someone else or readable by others, since its token may have been exposed or swapped.
export async function loadCredentials(env: NodeJS.ProcessEnv = process.env): Promise<Credentials | null> {
  const path = credentialsPath(env);

  if (!(await secureDir(credentialsDir(env), false))) {
    return null;
  }

  let file;
  try {
    // O_NOFOLLOW: fail instead of following a symlink planted in place of the file.
    file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    if (code === 'ELOOP') {
      throw new CliError(`${path} is a symlink, so devlib won't read it. Run devlib logout, then devlib login.`);
    }
    throw error;
  }

  try {
    const stats = await file.stat();

    if (!stats.isFile() || !isOwnedByMe(stats)) {
      throw new CliError(`${path} is not a file you own. Run devlib logout, then devlib login.`);
    }

    if (!isPrivate(stats)) {
      throw new CliError(
        `${path} can be read by other users, so its session may be exposed. Run devlib logout, then devlib login.`,
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(await file.readFile('utf8'));
    } catch {
      data = null;
    }

    if (!isCredentials(data)) {
      throw new CliError(`${path} is damaged. Run devlib logout, then devlib login.`);
    }

    return { apiUrl: data.apiUrl, sessionToken: data.sessionToken, user: data.user };
  } finally {
    await file.close();
  }
}

// Writes to a new private temp file in the same directory, then renames it over the old one,
// so the file is never half-written and never briefly readable by others.
export async function saveCredentials(credentials: Credentials, env: NodeJS.ProcessEnv = process.env) {
  const dir = credentialsDir(env);
  await secureDir(dir, true);

  const stored: StoredCredentials = { version: 1, ...credentials };
  const temp = join(dir, `.${FILE_NAME}.${randomBytes(8).toString('hex')}.tmp`);

  // "wx" fails if the temp name already exists (including as a symlink) instead of writing through it.
  const file = await open(temp, 'wx', 0o600);
  try {
    await file.writeFile(`${JSON.stringify(stored, null, 2)}\n`);
    await file.sync();
  } catch (error) {
    await file.close();
    await unlink(temp).catch(() => {});
    throw error;
  }
  await file.close();

  try {
    // rename replaces a symlink at the destination rather than writing to its target.
    await rename(temp, credentialsPath(env));
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

// Deletes the saved login, if any. Safe to call when logged out, or when the file is unreadable.
export async function clearCredentials(env: NodeJS.ProcessEnv = process.env) {
  try {
    await unlink(credentialsPath(env));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
