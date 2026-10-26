import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { client, signUp } from './helpers.js';

const app = buildApp();

beforeAll(() => app.ready());
afterAll(() => app.close());

type Api = ReturnType<typeof client>;

let alice: Api;
let bob: Api;
let bobId: string;

beforeEach(async () => {
  alice = client(app, (await signUp(app, 'Alice')).cookie);
  const bobAccount = await signUp(app, 'Bob');
  bob = client(app, bobAccount.cookie);
  bobId = bobAccount.id;
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

describe('reading', () => {
  it('lists only your own commands and tags', async () => {
    await createCommand(alice, 'Alice command', [await createTag(alice, 'alice-tag')]);
    await createCommand(bob, 'Bob command');

    const aliceCommands = (await alice.get('/commands')).json();
    expect(aliceCommands.map((command: { title: string }) => command.title)).toEqual(['Alice command']);
    expect((await bob.get('/tags')).json()).toEqual([]);
  });

  it('only searches your own commands', async () => {
    await createCommand(alice, 'deploy alice');
    await createCommand(bob, 'deploy bob');

    const results = (await bob.get('/commands?search=deploy')).json();
    expect(results.map((command: { title: string }) => command.title)).toEqual(['deploy bob']);
  });
});

describe("another user's command", () => {
  it('returns 404 on update and leaves it unchanged', async () => {
    const id = await createCommand(alice, 'Original');

    const response = await bob.put(`/commands/${id}`, { title: 'Hijacked', command: 'rm -rf /' });

    expect(response.statusCode).toBe(404);
    expect((await alice.get('/commands')).json()[0].title).toBe('Original');
  });

  it('returns 404 on delete and keeps it', async () => {
    const id = await createCommand(alice, 'Keep me');

    expect((await bob.delete(`/commands/${id}`)).statusCode).toBe(404);
    expect((await alice.get('/commands')).json()).toHaveLength(1);
  });

  it('gets the same 404 as a command that does not exist', async () => {
    const id = await createCommand(alice, 'Exists');

    const someoneElses = await bob.delete(`/commands/${id}`);
    const missing = await bob.delete('/commands/999999');

    expect(someoneElses.statusCode).toBe(missing.statusCode);
  });
});

describe('client-supplied user ids', () => {
  it('ignores userId in the body and uses the session user', async () => {
    const response = await alice.post('/commands', { title: 'Mine', command: 'whoami', userId: bobId });
    expect(response.statusCode).toBe(201);
    await alice.post('/tags', { name: 'mine', userId: bobId });

    expect((await alice.get('/commands')).json()).toHaveLength(1);
    expect((await alice.get('/tags')).json()).toHaveLength(1);
    expect((await bob.get('/commands')).json()).toEqual([]);
    expect((await bob.get('/tags')).json()).toEqual([]);
  });
});

describe('tag assignment', () => {
  it("rejects another user's tag when creating a command", async () => {
    const aliceTag = await createTag(alice, 'private');

    const response = await bob.post('/commands', { title: 'Sneaky', command: 'ls', tagIds: [aliceTag] });

    expect(response.statusCode).toBe(400);
    expect((await bob.get('/commands')).json()).toEqual([]);
  });

  it("rejects another user's tag when updating a command and keeps the old tags", async () => {
    const aliceTag = await createTag(alice, 'private');
    const bobTag = await createTag(bob, 'bob-tag');
    const id = await createCommand(bob, 'Bob command', [bobTag]);

    const response = await bob.put(`/commands/${id}`, { title: 'Bob command', command: 'ls', tagIds: [aliceTag] });

    expect(response.statusCode).toBe(400);
    expect((await bob.get('/commands')).json()[0].tags).toEqual([{ id: bobTag, name: 'bob-tag' }]);
  });

  it('rejects tag ids that do not exist', async () => {
    const response = await alice.post('/commands', { title: 'Ghost', command: 'ls', tagIds: [999999] });

    expect(response.statusCode).toBe(400);
  });

  it('accepts your own tags', async () => {
    const tag = await createTag(alice, 'mine');
    await createCommand(alice, 'Tagged', [tag]);

    expect((await alice.get('/commands')).json()[0].tags).toEqual([{ id: tag, name: 'mine' }]);
  });
});

describe('tag names', () => {
  it('lets different users use the same name', async () => {
    await createTag(alice, 'docker');
    await createTag(bob, 'docker');
  });

  it('rejects the same name twice for one user, ignoring case', async () => {
    await createTag(alice, 'docker');

    expect((await alice.post('/tags', { name: 'Docker' })).statusCode).toBe(409);
  });
});

describe('your own commands', () => {
  it('can be updated and deleted', async () => {
    const tag = await createTag(alice, 'mine');
    const id = await createCommand(alice, 'Before', [tag]);

    const updated = await alice.put(`/commands/${id}`, { title: 'After', command: 'ls' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ title: 'After', tags: [] });

    expect((await alice.delete(`/commands/${id}`)).statusCode).toBe(204);
    expect((await alice.get('/commands')).json()).toEqual([]);
  });
});
