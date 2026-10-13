import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { MemoryStorage } from './memory.js';
import type { Appointment } from '../types.js';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  const now = new Date().toISOString();
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    title: 'Test',
    startsAt: '2024-01-15T10:00:00.000Z',
    endsAt: '2024-01-15T11:00:00.000Z',
    status: 'created',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('creates and gets an appointment', async () => {
    const apt = makeAppointment({ id: 'a1' });
    await storage.create(apt);
    const got = await storage.get('a1');
    assert.deepStrictEqual(got, apt);
  });

  it('returns null for missing id', async () => {
    assert.strictEqual(await storage.get('missing'), null);
  });

  it('throws on duplicate create', async () => {
    const apt = makeAppointment({ id: 'dup' });
    await storage.create(apt);
    await assert.rejects(storage.create(apt), /already exists/);
  });

  it('returns copies so callers cannot mutate the store', async () => {
    const apt = makeAppointment({ id: 'copy' });
    await storage.create(apt);
    const got = await storage.get('copy');
    got!.title = 'MUTATED';
    const again = await storage.get('copy');
    assert.strictEqual(again!.title, 'Test');
  });

  it('does not retain a reference to the created object', async () => {
    const apt = makeAppointment({ id: 'ref' });
    await storage.create(apt);
    apt.title = 'MUTATED';
    const got = await storage.get('ref');
    assert.strictEqual(got!.title, 'Test');
  });

  it('updates an existing appointment', async () => {
    const apt = makeAppointment({ id: 'u1' });
    await storage.create(apt);
    const updated = { ...apt, title: 'Updated' };
    const result = await storage.update('u1', updated);
    assert.strictEqual(result.title, 'Updated');
    assert.strictEqual((await storage.get('u1'))!.title, 'Updated');
  });

  it('throws when updating a missing appointment', async () => {
    await assert.rejects(
      storage.update('missing', makeAppointment({ id: 'missing' })),
      /not found/
    );
  });

  it('deletes existing and returns true, false for missing', async () => {
    await storage.create(makeAppointment({ id: 'd1' }));
    assert.strictEqual(await storage.delete('d1'), true);
    assert.strictEqual(await storage.delete('d1'), false);
    assert.strictEqual(await storage.get('d1'), null);
  });

  it('lists all without filters in insertion order', async () => {
    await storage.create(makeAppointment({ id: '1', startsAt: '2024-01-16T10:00:00.000Z', endsAt: '2024-01-16T11:00:00.000Z' }));
    await storage.create(makeAppointment({ id: '2', startsAt: '2024-01-15T10:00:00.000Z', endsAt: '2024-01-15T11:00:00.000Z' }));
    const all = await storage.list();
    // no filters => no sort, insertion order preserved
    assert.deepStrictEqual(all.map((a) => a.id), ['1', '2']);
  });

  it('filters by single status and status array', async () => {
    await storage.create(makeAppointment({ id: '1', status: 'created' }));
    await storage.create(makeAppointment({ id: '2', status: 'confirmed' }));
    await storage.create(makeAppointment({ id: '3', status: 'cancelled' }));

    assert.deepStrictEqual(
      (await storage.list({ status: 'confirmed' })).map((a) => a.id),
      ['2']
    );
    assert.deepStrictEqual(
      (await storage.list({ status: ['created', 'cancelled'] })).map((a) => a.id),
      ['1', '3']
    );
  });

  it('filters by from/to time range', async () => {
    await storage.create(makeAppointment({ id: 'early', startsAt: '2024-01-10T10:00:00.000Z', endsAt: '2024-01-10T11:00:00.000Z' }));
    await storage.create(makeAppointment({ id: 'mid', startsAt: '2024-01-15T10:00:00.000Z', endsAt: '2024-01-15T11:00:00.000Z' }));
    await storage.create(makeAppointment({ id: 'late', startsAt: '2024-01-20T10:00:00.000Z', endsAt: '2024-01-20T11:00:00.000Z' }));

    const from = await storage.list({ from: '2024-01-12T00:00:00.000Z' });
    assert.deepStrictEqual(from.map((a) => a.id), ['mid', 'late']);

    const to = await storage.list({ to: '2024-01-16T00:00:00.000Z' });
    assert.deepStrictEqual(to.map((a) => a.id), ['early', 'mid']);

    const both = await storage.list({
      from: new Date('2024-01-12T00:00:00.000Z'),
      to: new Date('2024-01-16T00:00:00.000Z').getTime(),
    });
    assert.deepStrictEqual(both.map((a) => a.id), ['mid']);
  });

  it('sorts by startsAt when filters are present', async () => {
    await storage.create(makeAppointment({ id: 'b', startsAt: '2024-01-16T10:00:00.000Z', endsAt: '2024-01-16T11:00:00.000Z' }));
    await storage.create(makeAppointment({ id: 'a', startsAt: '2024-01-15T10:00:00.000Z', endsAt: '2024-01-15T11:00:00.000Z' }));
    const all = await storage.list({ status: ['created'] });
    assert.deepStrictEqual(all.map((a) => a.id), ['a', 'b']);
  });

  it('applies offset and limit', async () => {
    for (let i = 1; i <= 5; i++) {
      await storage.create(
        makeAppointment({
          id: `a${i}`,
          startsAt: `2024-01-1${i}T10:00:00.000Z`,
          endsAt: `2024-01-1${i}T11:00:00.000Z`,
        })
      );
    }
    const page = await storage.list({ offset: 1, limit: 2 });
    assert.deepStrictEqual(page.map((a) => a.id), ['a2', 'a3']);

    const offsetOnly = await storage.list({ offset: 4 });
    assert.deepStrictEqual(offsetOnly.map((a) => a.id), ['a5']);

    const limitOnly = await storage.list({ limit: 2 });
    assert.deepStrictEqual(limitOnly.map((a) => a.id), ['a1', 'a2']);
  });

  it('returns copies from list', async () => {
    await storage.create(makeAppointment({ id: 'c1' }));
    const listed = await storage.list();
    listed[0]!.title = 'MUTATED';
    assert.strictEqual((await storage.get('c1'))!.title, 'Test');
  });

  it('tracks size and clears', async () => {
    assert.strictEqual(storage.size, 0);
    await storage.create(makeAppointment({ id: 'x' }));
    assert.strictEqual(storage.size, 1);
    storage.clear();
    assert.strictEqual(storage.size, 0);
    assert.deepStrictEqual(await storage.list(), []);
  });
});
