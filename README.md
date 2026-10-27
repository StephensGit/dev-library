# Dev Library

Dev Library is a personal command library for developers.

It provides a simple place to save, organise, search and copy terminal commands that are useful enough to keep but easy to forget.

Instead of searching through old notes, documentation, shell history or Google, Dev Library gives you your own searchable reference of commands you've used before.

## The Problem

Developers regularly use commands that they don't necessarily remember.

For example:

```bash
docker compose exec db psql -U postgres -d dev_library
```

You might know exactly what the command does and when you need it, but not remember the exact syntax.

Dev Library is designed to answer a simple question:

> "I've done this before — what was that command again?"

## Core Experience

The main workflow is intentionally simple:

```text
Search
  ↓
Find command
  ↓
Copy
  ↓
Paste into terminal
```

Developers can also build their library over time:

```text
Add command
  ↓
Add description
  ↓
Select optional tags
  ↓
Save
```

## Commands

Each saved command contains:

- **Title** — a human-readable name
- **Command** — the terminal command itself
- **Description** — an optional explanation of what it does
- **Tags** — zero or more categories

Example:

```text
Title
Open Postgres shell in Docker

Command
docker compose exec db psql -U postgres -d dev_library

Description
Opens a PostgreSQL shell inside the local Docker container.

Tags
Docker · PostgreSQL
```

## Tags

Tags provide a lightweight way to organise and filter commands.

A command can have no tags, one tag or multiple tags.

Example tags might include:

```text
Git
Docker
PostgreSQL
pnpm
Node
macOS
```

Tags are deliberately secondary to search. The goal is not to create a complicated folder or categorisation system.

## Web Application

The main interface is a React web application.

The library should make it easy to:

- Search commands
- Browse saved commands
- Filter by tag
- Copy a command
- Add a new command

The UI should be desktop-first, compact and suitable for a growing command library.

Terminal commands should be visually prominent and extremely easy to copy.

## CLI

Dev Library also includes a command-line interface.

The CLI and web application use the same backend and database.

This allows commands to be retrieved without leaving the terminal.

For example:

```bash
devlib search docker
```

Commands can also be listed with:

```bash
devlib list
```

The CLI logs in through the web app, so it never asks for your password:

```bash
devlib login    # opens the browser; approve the code shown in your terminal
devlib whoami   # shows who you're logged in as
devlib logout   # ends the CLI's session
```

Both interfaces operate on the same library:

```text
React Web App ──┐
                │
                ▼
           Fastify API
                │
                ▼
            PostgreSQL
                ▲
                │
Dev Library CLI ┘
```

## Technical Architecture

Dev Library is built as a pnpm monorepo.

```text
dev-library/
│
├── apps/
│   ├── web/       React + TypeScript
│   ├── api/       Fastify + Node.js
│   └── cli/       Command-line interface
│
└── packages/
    └── db/        Drizzle + PostgreSQL
```

The overall architecture is:

```text
React / CLI
     ↓
    HTTP
     ↓
Fastify API
     ↓
Drizzle ORM
     ↓
PostgreSQL
```

## Current API

### Accounts

Each user has a private library. Registration, login, sessions and logout are handled by [Better Auth](https://www.better-auth.com) at `/api/auth/*` (for example `POST /api/auth/sign-up/email` and `POST /api/auth/sign-in/email`). Logging in sets an `HttpOnly`, `SameSite=Lax` session cookie (also `Secure` over HTTPS). Sessions are stored in PostgreSQL, so logging out ends them immediately. A session lasts 7 days and is extended when used after a day.

Rate limits, per client IP and stored in PostgreSQL:

| Endpoint                       | Limit                   |
| ------------------------------ | ----------------------- |
| `POST /api/auth/sign-in/email` | 5 per minute            |
| `POST /api/auth/sign-up/email` | 10 per hour             |
| Other `/api/auth/*` routes     | 100 per minute per path |

Going over a limit returns **429**.

### CLI login (device authorization)

`devlib login` uses Better Auth's [device authorization](https://www.better-auth.com/docs/plugins/device-authorization) plugin ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)):

1. The CLI calls `POST /api/auth/device/code` and shows a short code plus a link to the web app's `/device` page.
2. The user signs in to the web app as usual, checks that the page shows the same code as the terminal, and clicks **Approve** (or **Deny**).
3. Meanwhile the CLI polls `POST /api/auth/device/token`. Once approved, it receives a **Better Auth session token**: the same kind of token as the browser's session cookie, in its own `sessions` row. It's returned in a field called `access_token` because RFC 8628 names it that, but it isn't an OAuth access token or JWT, and there's no refresh token. It lasts 7 days and is extended when used, like a browser session.

Codes expire after 10 minutes and can be used once. Only the client id `devlib-cli` may start a login, only a signed-in user can approve it, and only the first user to open a code can approve or deny it. `GET /api/auth/device` is limited to 5 lookups per IP per 10 minutes.

The CLI sends the token as `Authorization: Bearer <token>`. Because another website can't make a browser send that header, a request authenticated by a valid Bearer token doesn't need an `Origin` header. Everything else still does:

- a request with both a cookie and an `Authorization` header is rejected with **400**
- on `/api/auth/*`, Bearer tokens are only accepted by `get-session` and `sign-out` (**403** elsewhere), so CLI logins can only be approved from a browser
- the Bearer plugin's `set-auth-token` response header is removed, so session tokens never reach page JavaScript

### Commands and tags

| Route                  | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `GET /commands`        | Your commands with their tags (`?search=` filters them) |
| `POST /commands`       | Create a command, optionally with some of your tags     |
| `PUT /commands/:id`    | Replace one of your commands                            |
| `DELETE /commands/:id` | Delete one of your commands                             |
| `GET /tags`            | Your tags                                               |
| `POST /tags`           | Create a tag (names are unique per user, ignoring case) |

These routes:

- return **401** without a valid session cookie or Bearer token
- only ever read or change the logged-in user's rows; another user's command returns **404**, the same as a missing one
- reject tag ids that aren't yours with **400**
- reject cookie-authenticated `POST`, `PUT` and `DELETE` requests whose `Origin` header is missing or isn't the web app's (**403**), which blocks cross-site request forgery
- allow 120 requests a minute per client IP (**429** after that), counted in memory
- reject request bodies over 100 KB (**413**)

Every response includes security headers from [`@fastify/helmet`](https://github.com/fastify/fastify-helmet).

Database transactions ensure that creating a command and its tag relationships either succeeds completely or is rolled back.

## Technology

### Frontend

- React
- TypeScript
- Vite

### Backend

- Node.js
- Fastify
- TypeScript

### Database

- PostgreSQL
- Drizzle ORM
- Docker for local PostgreSQL

### Tooling

- pnpm workspaces
- tsx
- Git

## Project Goal

Dev Library is primarily a learning project.

The aim is to go beyond building another React frontend and gain hands-on experience with the parts of application development that sit behind it:

- Node.js
- HTTP APIs
- backend frameworks
- PostgreSQL
- relational database design
- SQL concepts
- ORMs
- migrations
- seed data
- database transactions
- CLI development
- Docker
- monorepos
- eventually testing, CI and deployment

The application itself is deliberately straightforward so that the focus can remain on understanding how the complete system fits together.

Rather than treating the backend as a black box, the goal is to understand the full journey:

```text
User clicks Save
      ↓
React sends an HTTP request
      ↓
Fastify receives and validates it
      ↓
Drizzle creates a database query
      ↓
PostgreSQL stores the data
      ↓
The API returns a response
      ↓
React updates the UI
```

## Product Principle

Dev Library should remain a focused utility.

The core idea is:

**Save useful commands. Find them quickly. Copy them easily.**

New features should support that workflow rather than turning the project into a general-purpose developer dashboard.

# Local Development

This project uses:

- **pnpm** for dependencies and workspace management
- **Docker** for the local PostgreSQL database
- **Drizzle** for database migrations
- **Fastify** for the API

## Prerequisites

Before running the project, make sure you have installed:

- Node.js
- pnpm
- Docker Desktop

Docker Desktop must be running before starting the local database.

# First-Time Setup

These steps only need to be completed when setting up the project on a new machine.

## 1. Clone the repository

```bash
git clone <repository-url>
cd dev-library
```

## 2. Install dependencies

From the project root:

```bash
pnpm install
```

This installs the dependencies for all packages and applications in the monorepo.

## 3. Create the environment file

Create a `.env` file in the project root:

```bash
touch .env
```

Add the local PostgreSQL connection string and the Better Auth settings (see `.env.example`):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dev_library
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:5173
```

`BETTER_AUTH_URL` is where the browser opens the app. Only requests from that origin may change data.

The `.env` file is not committed to Git.

## 4. Start PostgreSQL

From the project root:

```bash
docker compose up -d
```

Check that the database container is running:

```bash
docker compose ps
```

PostgreSQL now runs locally inside Docker.

## 5. Run database migrations

From the project root:

```bash
pnpm --filter @dev-library/db db:migrate
```

This applies the existing Drizzle migrations and creates the required database tables.

## 6. Seed your library (optional)

Start the project (see below) and create an account in the web app. Then, from the project root:

```bash
pnpm --filter @dev-library/db db:seed you@example.com
```

This adds a few starter commands and tags to that account. It only runs on an empty library and never deletes or changes anyone's data.

# Running the Project

Once the first-time setup has been completed, you normally only need to start PostgreSQL and the applications.

## 1. Start PostgreSQL

From the project root:

```bash
docker compose up -d
```

Check that it is running:

```bash
docker compose ps
```

## 2. Start the API

Open a second terminal.

From the project root:

```bash
cd apps/api
```

Start the Fastify development server:

```bash
pnpm dev
```

The API will be available at:

```text
http://localhost:3000
```

Check that the API is running:

```bash
curl http://localhost:3000
```

The command routes need a login session, so without one they respond with 401:

```bash
curl -i http://localhost:3000/commands
```

## 3. Start the Web App

Open another terminal.

From the project root:

```bash
cd apps/web
```

Start the frontend development server:

```bash
pnpm dev
```

The terminal will display the local URL for the web application.

# CLI Setup

The CLI can be linked globally so that the `devlib` command can be used from anywhere in the terminal.

This only needs to be configured once on each machine.

## 1. Configure pnpm global commands

If global pnpm commands have not previously been configured on the machine, run:

```bash
pnpm setup
```

Restart the terminal after running the setup command.

On macOS using zsh, you can alternatively reload the shell configuration:

```bash
source ~/.zshrc
```

## 2. Build and link the CLI

From the project root:

```bash
cd apps/cli
```

Compile the CLI to JavaScript in `dist/`:

```bash
pnpm build
```

Link the package globally:

```bash
pnpm add --global "$PWD"
```

This links to the folder rather than copying it, so after changing the CLI you only need to run `pnpm build` again.

> Avoid `pnpm link --global .` here. With pnpm 11 it reinstalls `apps/cli` as a standalone project and leaves a stray `pnpm-workspace.yaml` and `pnpm-lock.yaml` behind.

The `devlib` command can now be used from anywhere in the terminal.

Check that it is available:

```bash
devlib --help
```

List saved commands:

```bash
devlib list
```

## 3. Log in

The API and web app must both be running (see above). Then:

```bash
devlib login
```

Your browser opens the web app's approval page. Log in if asked, check the code matches the one in your terminal, and click **Approve**. Use `devlib login --no-browser` to print the link without opening it.

```bash
devlib whoami   # who you're logged in as, and which API
devlib logout   # end the session on the server and forget it locally
```

If the API can't be reached during `devlib logout`, the saved login is still removed, with a warning that the session stays active on the server until it expires (within 7 days).

## 4. Use the CLI

List your saved commands:

```bash
devlib list
```

Search them:

```bash
devlib search docker
```

When the login expires or is revoked, these commands say so and ask you to run `devlib login` again.

## Configuration

| Variable          | Default                 | Purpose                                                                                  |
| ----------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `DEVLIB_API_URL`  | `http://localhost:3000` | The API to use. Must be `https://`, except for `localhost` and other loopback addresses. |
| `XDG_CONFIG_HOME` | `~/.config`             | Where the login is saved, in `devlib/credentials.json`.                                  |

The saved login holds the session token, the API URL and your name and email. The `devlib` directory is created with `0700` permissions and the file with `0600`, and the file is written to a temporary file first and then renamed. The CLI refuses to use a login file that is a symlink, belongs to another user or can be read by others. A login is only ever sent to the API it came from, and the CLI never follows redirects. If you change `DEVLIB_API_URL`, run `devlib login` again.

# Stopping the Project

## Stop the API or Web App

In the terminal running the development server, press:

```text
Ctrl + C
```

## Stop PostgreSQL

From the project root:

```bash
docker compose down
```

This stops and removes the PostgreSQL container.

The PostgreSQL data is stored in a Docker volume, so running:

```bash
docker compose down
```

does **not** delete the database data.

# Resetting the Database

If you need to completely remove the local database and start again:

```bash
docker compose down -v
```

Then start PostgreSQL again:

```bash
docker compose up -d
```

Run the migrations:

```bash
pnpm --filter @dev-library/db db:migrate
```

Register again in the web app, then optionally seed your library:

```bash
pnpm --filter @dev-library/db db:seed you@example.com
```

> `docker compose down -v` deletes the local PostgreSQL volume and all local database data.

# Production Requirements

Dev Library isn't deployed yet. Whatever hosting is chosen, these are required.

## One HTTPS origin for the web app and API

The browser must load the web app and call the API from the **same origin**, for example `https://devlibrary.example.com`. A reverse proxy in front of both does what the Vite dev proxy does locally:

| Path            | Goes to                                 |
| --------------- | --------------------------------------- |
| `/api/auth/*`   | the API, path unchanged                 |
| `/api/*`        | the API, with the `/api` prefix removed |
| everything else | the built web app (`apps/web/dist`)     |

This matters because:

- the session cookie is `SameSite=Lax` and only sent to the site that set it
- the API only accepts writes whose `Origin` is exactly `BETTER_AUTH_URL`
- the API sends no CORS headers, so browsers block other sites from reading its responses

## Environment

| Variable             | Production value                                                    |
| -------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`           | `production`                                                        |
| `BETTER_AUTH_URL`    | The public `https://` URL. The API refuses to start with `http://`. |
| `BETTER_AUTH_SECRET` | At least 32 random characters, never reused from development        |
| `DATABASE_URL`       | The production database                                             |
| `TRUST_PROXY`        | Which proxies may report the client IP (below)                      |

The API checks these at startup and refuses to run if they're missing or unsafe.

## Client IPs behind a proxy (`TRUST_PROXY`)

Rate limits are counted per client IP. Behind a reverse proxy every request arrives from the proxy's address, so the API must be told which proxies to believe when they report the real client in `X-Forwarded-For`:

- **unset** (default): trust no proxy. Correct locally and when the API is reached directly.
- **a hop count**, such as `1`: trust that many proxies directly in front of the API.
- **proxy addresses**, such as `10.0.0.0/8,127.0.0.1`: trust only proxies at these IPs or ranges.

`TRUST_PROXY=true` is refused, because it would let any client pick its own IP and dodge the rate limits. Getting this wrong in the other direction (no `TRUST_PROXY` behind a proxy) makes every user share one rate-limit bucket, so a few failed logins would lock everyone out.

## One API instance

Command and tag rate limits are counted in the API's memory, so they assume a single API server. Running several would need a shared store.

## Before going public

Still to do before Dev Library is exposed to the internet:

- [ ] **Hosting:** one HTTPS origin with a reverse proxy routing paths as described above, and `TRUST_PROXY` set to match it.
- [ ] **Secrets:** `NODE_ENV=production`, an `https://` `BETTER_AUTH_URL`, and a fresh `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) stored in the host's secret manager.
- [ ] **Web app headers:** whatever serves `apps/web/dist` must send its own security headers (Content-Security-Policy, HSTS, `X-Content-Type-Options`, `frame-ancestors`). The API's Helmet headers only cover API responses.
- [ ] **Database:** automated backups, encryption at rest, and access restricted to the API. Backups contain password hashes, so treat them as secrets; delete old local `pg_dump` files.
- [ ] **Email verification:** registration currently reveals whether an email already has an account ("User already exists"). Hiding that, and adding password reset, needs an email provider and Better Auth's email verification.
- [ ] **Per-account protection:** rate limits are per IP, so slow password guessing from many IPs isn't stopped. Consider per-account throttling or alerts.
- [ ] **CORS:** keep it off. Allowing other origins with credentials would undo the CSRF protection.
- [ ] **Dependencies:** `pnpm audit --prod` with no unresolved high findings; remove the `fast-uri` override in `pnpm-workspace.yaml` once upstream ranges require the fix.
- [ ] **Final check:** a manual pass on the deployed site (register, log in, CRUD, log out, rate limits, cookie flags in the browser's dev tools).

# Quick Reference

## First-Time Setup

```bash
pnpm install
docker compose up -d
pnpm --filter @dev-library/db db:migrate
# After registering in the web app:
pnpm --filter @dev-library/db db:seed you@example.com
```

## Tests

The API integration tests use a separate database, `dev_library_test`, which they create, migrate and empty automatically. Postgres must be running:

```bash
pnpm test
```

To use a different database, set `TEST_DATABASE_URL`. Its name must end in `_test`, so the tests can never wipe your development data.

## Normal Development

### Terminal 1 — Database

```bash
docker compose up -d
```

### Terminal 2 — API

```bash
cd apps/api
pnpm dev
```

### Terminal 3 — Web

```bash
cd apps/web
pnpm dev
```

## CLI

Temporarily returns 401 until CLI login is added (see [CLI](#cli)).

```bash
devlib list
```

Search for a command:

```bash
devlib search docker
```

## Useful URLs

```text
Fastify API
http://localhost:3000

Web app (log in here)
http://localhost:5173

Commands endpoint (needs a login session)
http://localhost:3000/commands
```

## Shut Everything Down

Stop the API and web development servers with:

```text
Ctrl + C
```

Then stop PostgreSQL:

```bash
docker compose down
```
