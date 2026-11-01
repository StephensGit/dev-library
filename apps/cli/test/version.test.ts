import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packageVersion } from '../src/version.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devlib-version-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('packageVersion', () => {
  it("reports this package's version", async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };

    expect(packageVersion()).toBe(pkg.version);
  });

  it('reads the version from the given package.json', async () => {
    const path = join(root, 'package.json');
    await writeFile(path, JSON.stringify({ name: 'x', version: '9.8.7' }));

    expect(packageVersion(pathToFileURL(path))).toBe('9.8.7');
  });

  it('fails clearly when package.json has no version', async () => {
    const path = join(root, 'package.json');
    await writeFile(path, JSON.stringify({ name: 'x' }));

    expect(() => packageVersion(pathToFileURL(path))).toThrow(/No version found/);
  });
});
