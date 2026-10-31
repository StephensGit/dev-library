import { pool } from '@dev-library/db';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { config } from './config.js';
import { loggerOptions } from './logger.js';

// How long in-flight requests get to finish after SIGTERM before the process exits anyway.
const SHUTDOWN_TIMEOUT_MS = 10_000;

// The production build (pnpm build) copies the web app to dist/public, next to this file once bundled.
// Run from source (pnpm dev) there's no public folder, so this is an API-only server and Vite serves the web app.
const webRoot = fileURLToPath(new URL('./public/', import.meta.url));
const hasWebApp = existsSync(`${webRoot}index.html`);

if (config.isProduction && !hasWebApp) {
  throw new Error(`The web app isn't built: ${webRoot}index.html is missing. Run pnpm build.`);
}

const fastify = buildApp({
  logger: loggerOptions,
  ...(hasWebApp ? { webRoot } : {}),
});

// Close the database pool after the server has stopped taking requests.
fastify.addHook('onClose', async () => {
  await pool.end();
});

// Hosting platforms send SIGTERM before replacing the server; Ctrl+C sends SIGINT.
// Stop accepting connections, let in-flight requests finish, then exit.
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  fastify.log.info({ signal }, 'Shutting down');
  setTimeout(() => {
    fastify.log.error('Requests did not finish in time; exiting anyway');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    await fastify.close();
    process.exit(0);
  } catch (error) {
    fastify.log.error(error, 'Error while shutting down');
    process.exit(1);
  }
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

const start = async () => {
  try {
    await fastify.listen({
      port: Number(process.env.PORT ?? 3000),
      // In production the platform's proxy reaches the server over the network, so listen on every interface.
      // Locally, stay on this machine. HOST overrides either.
      host: process.env.HOST ?? (config.isProduction ? '0.0.0.0' : 'localhost'),
    });

    if (!hasWebApp) {
      fastify.log.info('Web app not built: serving the API only');
    }
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
