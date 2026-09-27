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

Dev Library will also have a command-line interface.

The CLI and web application will use the same backend and database.

The long-term idea is that a developer could retrieve commands without leaving their terminal.

For example:

```bash
devlib search docker
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

## Local Development

### Prerequisites

Make sure Docker is running before starting the local database.

### 1. Start PostgreSQL

From the project root:

```bash
cd ~/Documents/dev-library
```

Start the PostgreSQL Docker container:

```bash
docker compose up -d
```

Check that the container is running:

```bash
docker compose ps
```

The PostgreSQL database now runs inside Docker.

### 2. Start the API

Open a second terminal and move to the API:

```bash
cd ~/Documents/dev-library/apps/api
```

Start the Fastify development server:

```bash
pnpm dev
```

The API will be available at:

```text
http://localhost:3000
```

You can check that it is running with:

```bash
curl http://localhost:3000
```

Or retrieve the command library:

```bash
curl http://localhost:3000/commands
```

### 3. Stop the API

In the terminal running Fastify, press:

```text
Ctrl + C
```

### 4. Stop PostgreSQL

From the project root:

```bash
cd ~/Documents/dev-library
```

Stop and remove the Docker containers:

```bash
docker compose down
```

The PostgreSQL data is persisted in the Docker volume, so stopping the container does not delete the database.

### Quick Reference

```text
Terminal 1 — Database

cd ~/Documents/dev-library
docker compose up -d


Terminal 2 — API

cd ~/Documents/dev-library/apps/api
pnpm dev
```

Then:

```text
PostgreSQL → Docker
Fastify API → http://localhost:3000
```
