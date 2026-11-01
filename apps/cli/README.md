# devlib

The command-line client for [Dev Library](https://dev-library-gjfn.onrender.com): list and search your saved developer commands from the terminal.

## Requirements

- Node.js 22.12 or later
- A Dev Library account. Sign-up is currently closed, so ask the administrator for one.

## Install

```bash
npm install --global @stephenmoran/devlib
```

This installs the `devlib` command. Check it works:

```bash
devlib --version
```

To update later, run the install command again. To remove it:

```bash
npm uninstall --global @stephenmoran/devlib
```

## Log in

```bash
devlib login
```

Your browser opens the Dev Library approval page. Log in if asked, check that the code matches the one in your terminal, and click **Approve**. The CLI never asks for your password.

On a machine without a browser, print the link instead and open it anywhere:

```bash
devlib login --no-browser
```

A login lasts 7 days and is extended each time you use it.

## Commands

| Command                 | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `devlib login`          | Log in by approving this computer in the web app                |
| `devlib login --force`  | Log in again even if already logged in                          |
| `devlib whoami`         | Show who you're logged in as, and which API                     |
| `devlib list`           | List your saved commands                                        |
| `devlib search <query>` | Search your saved commands, e.g. `devlib search docker`         |
| `devlib logout`         | End this computer's session on the server and forget it locally |
| `devlib --help`         | Show help (also works after any command)                        |
| `devlib --version`      | Show the installed version                                      |

## Configuration

| Variable          | Default                                 | Purpose                                                                                  |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DEVLIB_API_URL`  | `https://dev-library-gjfn.onrender.com` | The API to use. Must be `https://`, except for `localhost` and other loopback addresses. |
| `XDG_CONFIG_HOME` | `~/.config`                             | Where the login is saved, in `devlib/credentials.json`.                                  |

For example, to use a Dev Library API running on your own machine:

```bash
DEVLIB_API_URL=http://localhost:3000 devlib login
DEVLIB_API_URL=http://localhost:3000 devlib list
```

A saved login belongs to the API it was made with and is never sent anywhere else. If you switch APIs, run `devlib login` again.

The login file is created with `0600` permissions inside a `0700` directory. The CLI refuses to use it if it is a symlink, belongs to another user or can be read by others.

## Troubleshooting

**`devlib: command not found`**: npm's global `bin` folder isn't on your `PATH`. Run `npm prefix --global` and add its `bin` subfolder to `PATH`, then open a new terminal.

**`Unsupported engine` or a syntax error on start**: your Node.js is older than 22.12. Check with `node --version` and upgrade.

**`Waiting for the Dev Library server…`**: the hosted server sleeps when idle and takes up to a minute to wake. devlib waits up to 90 seconds for a response, so just let it finish.

**`didn't respond within 90 seconds`**: the server is still starting or overloaded. Try again in a minute.

**`Could not connect to the Dev Library API`**: check your internet connection. If you set `DEVLIB_API_URL`, check that it is correct and that the API is running.

**`You're logged in to …, but …`**: your saved login is for a different API than the one in use. Run `devlib login`, or set `DEVLIB_API_URL` back to the API you logged in to.

**`Your login has expired or was revoked` / `You're not logged in`**: run `devlib login`.

**The saved login is damaged or has unsafe permissions**: run `devlib logout`, then `devlib login`. To remove it by hand, delete `~/.config/devlib/credentials.json`.

## License

MIT
