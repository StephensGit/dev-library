import { readFileSync } from 'node:fs';

// The CLI's version, read from its own package.json. npm always ships package.json, and it sits one
// level above both src/ (when run with tsx) and dist/ (when built or installed from npm).
export function packageVersion(packageJsonUrl = new URL('../package.json', import.meta.url)): string {
  const { version } = JSON.parse(readFileSync(packageJsonUrl, 'utf8')) as { version?: unknown };

  if (typeof version !== 'string' || version === '') {
    throw new Error(`No version found in ${packageJsonUrl.href}`);
  }

  return version;
}
