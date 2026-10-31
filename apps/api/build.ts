// Builds a self-contained production bundle in dist/:
//   dist/server.js    the API, which also serves the web app
//   dist/migrate.js   applies database migrations (run before each deploy)
//   dist/migrations/  the SQL migrations from packages/db/drizzle
//   dist/public/      the built web app from apps/web/dist (build it first: `pnpm build` at the root does both)
// Every npm dependency is bundled in, so dist/ runs with plain `node` and no node_modules.
import { build } from 'esbuild';
import { cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const dist = new URL('./dist/', import.meta.url);
const webDist = new URL('../web/dist/', import.meta.url);
const migrations = new URL('../../packages/db/drizzle/', import.meta.url);

if (!existsSync(new URL('index.html', webDist))) {
  throw new Error('apps/web/dist is missing. Build the web app first: pnpm --filter web build');
}

await rm(dist, { recursive: true, force: true });

await build({
  entryPoints: ['src/server.ts', 'src/migrate.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  // pg loads pg-native only if asked to; it isn't installed.
  external: ['pg-native'],
  // Some bundled dependencies are CommonJS and call require(), which ES modules don't have.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

await cp(migrations, new URL('migrations/', dist), { recursive: true });
await cp(webDist, new URL('public/', dist), { recursive: true });

console.log('Built apps/api/dist');
