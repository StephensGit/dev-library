import { CONNECTION_TIMEOUT_MS, createPool, databaseErrorCode, pool } from '@dev-library/db';
import { createServer, type Server, type Socket } from 'node:net';
import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('database pool settings', () => {
  it('gives up connecting after 10 seconds', () => {
    expect(CONNECTION_TIMEOUT_MS).toBe(10_000);
    expect(pool.options.connectionTimeoutMillis).toBe(10_000);
  });

  it('listens for idle connection errors', () => {
    expect(pool.listenerCount('error')).toBeGreaterThan(0);
  });
});

describe('connection timeout', () => {
  // Accepts TCP connections but never answers, like a database that's unreachable past a firewall.
  let server: Server;
  const sockets: Socket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => server.close(resolve));
  });

  it('fails the query instead of waiting forever', async () => {
    server = createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };

    const silent = createPool({
      connectionString: `postgresql://user:not-a-real-password@127.0.0.1:${port}/db`,
      connectionTimeoutMillis: 200,
    });

    try {
      await expect(silent.query('select 1')).rejects.toThrow(/timeout/i);
    } finally {
      await silent.end();
    }
  });
});

describe('idle connection errors', () => {
  it('logs a lost idle connection without crashing, and the pool recovers', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testPool = createPool();

    try {
      // Open a connection and return it to the pool, where it sits idle.
      const client = await testPool.connect();
      const { rows } = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
      const pid = rows[0].pid;
      client.release();

      const lost = new Promise<void>((resolve) => testPool.once('error', () => resolve()));

      // Kill that idle connection from the database side, as a network drop or a Neon restart would.
      const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await admin.connect();
      await admin.query('select pg_terminate_backend($1)', [pid]);
      await admin.end();

      await lost;

      // Terminated by an administrator: Postgres code 57P01, and nothing else.
      expect(consoleError.mock.calls).toEqual([
        ['Database connection lost while idle (code 57P01); it will be replaced on next use.'],
      ]);

      // The broken connection was discarded; the next query gets a fresh one.
      expect((await testPool.query('select 1 as ok')).rows).toEqual([{ ok: 1 }]);
    } finally {
      await testPool.end();
    }
  });

  it('logs only a generic description and the error code', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testPool = createPool({ connectionString: 'postgresql://neondb_owner:s3cret-pw@ep-x.neon.tech/neondb' });

    const error = Object.assign(
      new Error('connect failed for postgresql://neondb_owner:s3cret-pw@ep-x.neon.tech/neondb?sslmode=require'),
      { code: 'ECONNRESET' },
    );
    testPool.emit('error', error, {} as pg.PoolClient);

    expect(consoleError.mock.calls).toEqual([
      ['Database connection lost while idle (code ECONNRESET); it will be replaced on next use.'],
    ]);

    return testPool.end();
  });
});

describe('database error codes', () => {
  it.each([
    [Object.assign(new Error('terminating connection'), { code: '57P01' }), '57P01'],
    [Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }), 'ECONNRESET'],
    [new Error('no code here'), 'unknown'],
    ['not an error', 'unknown'],
    [null, 'unknown'],
  ])('%s → %s', (error, expected) => {
    expect(databaseErrorCode(error)).toBe(expected);
  });
});
