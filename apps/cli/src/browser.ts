import { spawn } from 'node:child_process';

// Opens a URL in the default browser without going through a shell, so nothing in the URL is interpreted.
// Returns false if no browser could be started; the caller prints the URL either way.
export function openBrowser(url: string): Promise<boolean> {
  if (!/^https?:\/\//.test(url)) {
    return Promise.resolve(false);
  }

  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
