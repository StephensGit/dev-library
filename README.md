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

The API currently supports:

### GET /commands

Returns saved commands together with their tags.

### POST /commands

Creates a new command and optionally associates it with existing tags.

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

Add the local PostgreSQL connection string:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dev_library
```

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

## 6. Seed the database

From the project root:

```bash
pnpm --filter @dev-library/db db:seed
```

This adds the initial development data to the database.

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

Retrieve the command library:

```bash
curl http://localhost:3000/commands
```

You should receive the seeded commands as JSON.

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

## 2. Link the CLI

From the project root:

```bash
cd apps/cli
```

Link the package globally:

```bash
pnpm link --global .
```

The `devlib` command can now be used from anywhere in the terminal.

Check that it is available:

```bash
devlib --help
```

List saved commands:

```bash
devlib list
```

Search the library:

```bash
devlib search docker
```

For example:

```bash
devlib search postgres
```

The CLI communicates with the Fastify API, so the local API must be running before using commands that retrieve data.

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

Seed the database:

```bash
pnpm --filter @dev-library/db db:seed
```

> `docker compose down -v` deletes the local PostgreSQL volume and all local database data.

# Quick Reference

## First-Time Setup

```bash
pnpm install
docker compose up -d
pnpm --filter @dev-library/db db:migrate
pnpm --filter @dev-library/db db:seed
```

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

Commands endpoint
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
