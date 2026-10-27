import { pool } from '@dev-library/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client, signUp } from './helpers.js';

const app = buildApp();

beforeAll(() => app.ready());
afterAll(() => app.close());

type Api = ReturnType<typeof client>;

let alice: Api;
let aliceCookie: string;
let bob: Api;

beforeEach(async () => {
  aliceCookie = (await signUp(app, 'Alice')).cookie;
  alice = client(app, aliceCookie);
  bob = client(app, (await signUp(app, 'Bob')).cookie);
});

async function createTag(api: Api, name: string) {
  const response = await api.post('/tags', { name });
  expect(response.statusCode).toBe(201);
  return response.json().id as number;
}

async function createCommand(api: Api, title: string, tagIds: number[] = []) {
  const response = await api.post('/commands', { title, command: `echo ${title}`, tagIds });
  expect(response.statusCode).toBe(201);
  return response.json().id as number;
}

async function tagNames(api: Api) {
  return (await api.get('/tags')).json().map((tag: { name: string }) => tag.name);
}

// Read straight from the database so the test also sees columns the API doesn't return.
async function commandRows() {
  const { rows } = await pool.query('select id, title, command, description, updated_at from commands order by id');
  return rows;
}

async function linkCount(tagId: number) {
  const { rows } = await pool.query<{ count: string }>('select count(*) from command_tags where tag_id = $1', [tagId]);
  return Number(rows[0].count);
}

describe('renaming a tag', () => {
  it('renames your own tag', async () => {
    const id = await createTag(alice, 'dokcer');

    const response = await alice.put(`/tags/${id}`, { name: '  docker  ' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id, name: 'docker' });
    expect(await tagNames(alice)).toEqual(['docker']);
  });

  it('keeps its command associations', async () => {
    const id = await createTag(alice, 'k8s');
    const otherTag = await createTag(alice, 'ops');
    await createCommand(alice, 'Pods', [id, otherTag]);
    await createCommand(alice, 'Nodes', [id]);

    expect((await alice.put(`/tags/${id}`, { name: 'kubernetes' })).statusCode).toBe(200);

    const commands = (await alice.get('/commands')).json();
    expect(commands).toMatchObject([
      { title: 'Nodes', tags: [{ id, name: 'kubernetes' }] },
      {
        title: 'Pods',
        tags: [
          { id, name: 'kubernetes' },
          { id: otherTag, name: 'ops' },
        ],
      },
    ]);
  });

  it('rejects a name another of your tags has, ignoring case', async () => {
    await createTag(alice, 'docker');
    const id = await createTag(alice, 'git');

    const response = await alice.put(`/tags/${id}`, { name: 'DOCKER' });

    expect(response.statusCode).toBe(409);
    expect(await tagNames(alice)).toEqual(['docker', 'git']);
  });

  it("allows a name another user's tag has", async () => {
    await createTag(bob, 'docker');
    const id = await createTag(alice, 'git');

    expect((await alice.put(`/tags/${id}`, { name: 'docker' })).statusCode).toBe(200);
  });

  it('allows changing only the capitalisation', async () => {
    const id = await createTag(alice, 'docker');

    const response = await alice.put(`/tags/${id}`, { name: 'Docker' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id, name: 'Docker' });
    expect(await tagNames(alice)).toEqual(['Docker']);
  });

  it('allows saving the same name unchanged', async () => {
    const id = await createTag(alice, 'docker');

    expect((await alice.put(`/tags/${id}`, { name: 'docker' })).statusCode).toBe(200);
  });

  it.each([
    ['an empty name', { name: '' }],
    ['a whitespace-only name', { name: '   ' }],
    ['a name over 50 characters', { name: 'x'.repeat(51) }],
    ['a missing name', {}],
  ])('rejects %s', async (_, payload) => {
    const id = await createTag(alice, 'docker');

    expect((await alice.put(`/tags/${id}`, payload)).statusCode).toBe(400);
    expect(await tagNames(alice)).toEqual(['docker']);
  });

  it('ignores userId in the body', async () => {
    const id = await createTag(alice, 'docker');

    const response = await alice.put(`/tags/${id}`, { name: 'Docker', userId: 'someone-else' });

    expect(response.statusCode).toBe(200);
    expect(await tagNames(alice)).toEqual(['Docker']);
    expect(await tagNames(bob)).toEqual([]);
  });
});

// Fastify would otherwise coerce these to strings ("42", "true", "") and accept them.
describe('non-string tag names', () => {
  const nonStrings: [string, unknown][] = [
    ['a number', 42],
    ['a boolean', true],
    ['null', null],
    ['an array', ['docker']],
    ['an object', { value: 'docker' }],
  ];

  it.each(nonStrings)('rejects %s when creating', async (_, name) => {
    const response = await alice.post('/tags', { name });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('body/name must be string');
    expect(await tagNames(alice)).toEqual([]);
  });

  it.each(nonStrings)('rejects %s when renaming', async (_, name) => {
    const id = await createTag(alice, 'docker');

    const response = await alice.put(`/tags/${id}`, { name });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('body/name must be string');
    expect(await tagNames(alice)).toEqual(['docker']);
  });

  it('still accepts a numeric-looking string', async () => {
    const id = await createTag(alice, '42');

    expect((await alice.put(`/tags/${id}`, { name: '2024' })).statusCode).toBe(200);
    expect(await tagNames(alice)).toEqual(['2024']);
  });

  it('still validates the name when it is a string', async () => {
    expect((await alice.post('/tags', {})).statusCode).toBe(400);
    expect((await alice.post('/tags', { name: '  ' })).statusCode).toBe(400);
  });
});

describe('deleting a tag', () => {
  it('removes the tag from several commands but keeps the commands', async () => {
    const id = await createTag(alice, 'shared');
    const keep = await createTag(alice, 'keep');
    await createCommand(alice, 'One', [id]);
    await createCommand(alice, 'Two', [id, keep]);
    await createCommand(alice, 'Three', [id]);
    await createCommand(alice, 'Untagged');
    const before = await commandRows();
    expect(await linkCount(id)).toBe(3);

    expect((await alice.delete(`/tags/${id}`)).statusCode).toBe(204);

    expect(await tagNames(alice)).toEqual(['keep']);
    expect(await linkCount(id)).toBe(0);
    expect(await linkCount(keep)).toBe(1);
    // Same rows, unchanged, including updated_at.
    expect(await commandRows()).toEqual(before);

    const commands = (await alice.get('/commands')).json();
    expect(commands.map((command: { title: string; tags: unknown[] }) => [command.title, command.tags])).toEqual([
      ['One', []],
      ['Three', []],
      ['Two', [{ id: keep, name: 'keep' }]],
      ['Untagged', []],
    ]);
  });

  it('still lets you create and filter commands afterwards', async () => {
    const id = await createTag(alice, 'old');
    await alice.delete(`/tags/${id}`);
    const fresh = await createTag(alice, 'old');

    await createCommand(alice, 'Again', [fresh]);

    expect((await alice.get('/commands?search=old')).json()).toMatchObject([{ title: 'Again' }]);
  });
});

describe("another user's tag", () => {
  it('returns 404 on rename and leaves it unchanged', async () => {
    const id = await createTag(alice, 'private');

    expect((await bob.put(`/tags/${id}`, { name: 'hijacked' })).statusCode).toBe(404);
    expect(await tagNames(alice)).toEqual(['private']);
  });

  it('returns 404 on delete and keeps it and its links', async () => {
    const id = await createTag(alice, 'private');
    await createCommand(alice, 'Mine', [id]);

    expect((await bob.delete(`/tags/${id}`)).statusCode).toBe(404);
    expect(await tagNames(alice)).toEqual(['private']);
    expect(await linkCount(id)).toBe(1);
  });

  it('gets the same 404 as a tag that does not exist', async () => {
    const id = await createTag(alice, 'private');

    const someoneElses = await bob.put(`/tags/${id}`, { name: 'x' });
    const missing = await bob.put('/tags/999999', { name: 'x' });

    expect(someoneElses.statusCode).toBe(missing.statusCode);
  });
});

describe('tags that do not exist', () => {
  it('returns 404 on rename and delete', async () => {
    expect((await alice.put('/tags/999999', { name: 'ghost' })).statusCode).toBe(404);
    expect((await alice.delete('/tags/999999')).statusCode).toBe(404);
  });

  it('returns 404 when deleting the same tag twice', async () => {
    const id = await createTag(alice, 'once');

    expect((await alice.delete(`/tags/${id}`)).statusCode).toBe(204);
    expect((await alice.delete(`/tags/${id}`)).statusCode).toBe(404);
  });

  it.each(['abc', '0', '-1', '1.5'])('rejects the invalid id %s', async (id) => {
    expect((await alice.put(`/tags/${id}`, { name: 'x' })).statusCode).toBe(400);
    expect((await alice.delete(`/tags/${id}`)).statusCode).toBe(400);
  });
});

describe('without a session', () => {
  it('rejects rename and delete', async () => {
    const id = await createTag(alice, 'docker');
    const anonymous = client(app);

    expect((await anonymous.put(`/tags/${id}`, { name: 'x' })).statusCode).toBe(401);
    expect((await anonymous.delete(`/tags/${id}`)).statusCode).toBe(401);
    expect(await tagNames(alice)).toEqual(['docker']);
  });

  it('rejects a cookie request from another origin', async () => {
    const id = await createTag(alice, 'docker');
    const headers = { cookie: aliceCookie, origin: 'https://evil.example' };

    const rename = await app.inject({ method: 'PUT', url: `/tags/${id}`, headers, payload: { name: 'x' } });
    const remove = await app.inject({ method: 'DELETE', url: `/tags/${id}`, headers });

    expect(rename.statusCode).toBe(403);
    expect(remove.statusCode).toBe(403);
    expect(await tagNames(alice)).toEqual(['docker']);
  });
});
