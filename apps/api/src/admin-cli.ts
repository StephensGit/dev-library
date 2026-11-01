// Shared by the admin scripts (create-user, reset-password), which run from a shell on the server.
// Passwords are only ever typed at a hidden prompt: never taken from arguments or environment variables
// (those end up in shell history and process listings), and never printed or logged.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const PASSWORD_ARG = /^--?(p|password)(=|$)/i;

// Parses --email and --name. Node's own parse errors quote the offending argument, which could be
// a mistyped password, so every problem is reported as the usage line instead.
export function parseAdminArgs(args: string[], usage: string, { allowName }: { allowName: boolean }) {
  if (args.some((arg) => PASSWORD_ARG.test(arg))) {
    throw new Error('The password is never accepted as an argument. You will be asked for it.');
  }

  let values: { email?: string; name?: string };
  try {
    ({ values } = parseArgs({
      args,
      options: { email: { type: 'string' }, name: { type: 'string' } },
      strict: true,
    }));
  } catch {
    throw new Error(usage);
  }

  if (!values.email || (!allowName && values.name !== undefined)) {
    throw new Error(usage);
  }

  return { email: values.email, name: values.name };
}

// Reads a line from the terminal without echoing it.
function promptHidden(question: string) {
  const { stdin, stdout } = process;

  return new Promise<string>((resolve, reject) => {
    let value = '';

    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          return finish();
        }
        if (char === '\u0003' || char === '\u0004') {
          return finish(new Error('Cancelled.'));
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else if (char >= ' ') {
          value += char;
        }
      }
    };

    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

// Asks for a password twice at a hidden prompt.
export async function promptNewPassword(label: string, nothingChanged: string) {
  const password = await promptHidden(`${label}: `);

  if ((await promptHidden(`Repeat ${label.toLowerCase()}: `)) !== password) {
    throw new Error(`The passwords did not match. ${nothingChanged}`);
  }

  return password;
}

// Hidden input needs a real terminal; piping a password in would mean it was stored or echoed somewhere.
export function requireInteractiveTerminal() {
  if (!process.stdin.isTTY) {
    throw new Error('Run this in an interactive terminal: the password is read from a hidden prompt.');
  }
}

// Runs main() only when the file is executed directly (so tests can import it), printing only an
// error's message: no stack traces or objects that might carry input.
export function runIfMain(moduleUrl: string, main: () => Promise<void>, fallbackMessage: string) {
  if (!process.argv[1] || moduleUrl !== pathToFileURL(process.argv[1]).href) {
    return;
  }

  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : fallbackMessage);
    process.exit(1);
  });
}
