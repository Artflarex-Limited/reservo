import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createManager, AppointmentManager } from './manager.js';
import { MemoryStorage } from './storage/memory.js';
import {
  AppointmentNotFoundError,
  InvalidStateTransitionError,
  ValidationError,
} from './errors.js';
import type { AppointmentEvent, StorageAdapter, TransportAdapter } from './types.js';

function futureRange(baseMs = Date.now() + 3600000) {
  return {
    startsAt: new Date(baseMs),
    endsAt: new Date(baseMs + 3600000),
  };
}

describe('AppointmentManager extended', () => {
  let manager: AppointmentManager;

  beforeEach(() => {
    manager = createManager();
  });

  describe('createAppointment validation', () => {
    it('respects a custom id', async () => {
      const apt = await manager.createAppointment({
        id: 'custom-id',
        title: 'T',
        ...futureRange(),
      });
      assert.strictEqual(apt.id, 'custom-id');
    });

    it('trims title and description', async () => {
      const apt = await manager.createAppointment({
        title: '  Padded  ',
        description: '  desc  ',
        ...futureRange(),
      });
      assert.strictEqual(apt.title, 'Padded');
      assert.strictEqual(apt.description, 'desc');
    });

    it('leaves description undefined when omitted', async () => {
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      assert.strictEqual(apt.description, undefined);
    });

    it('rejects whitespace-only title with field=title', async () => {
      try {
        await manager.createAppointment({ title: '   ', ...futureRange() });
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof ValidationError);
        assert.strictEqual(err.field, 'title');
      }
    });

    it('rejects invalid dates', async () => {
      await assert.rejects(
        manager.createAppointment({
          title: 'T',
          startsAt: 'not-a-date',
          endsAt: 'also-bad',
        }),
        /Invalid date/
      );
    });

    it('rejects end equal to start', async () => {
      const t = new Date('2024-01-15T10:00:00Z');
      await assert.rejects(
        manager.createAppointment({ title: 'T', startsAt: t, endsAt: t }),
        /End time must be after start time/
      );
    });

    it('rejects duplicate custom id (storage error propagates)', async () => {
      await manager.createAppointment({ id: 'dup', title: 'T', ...futureRange() });
      await assert.rejects(
        manager.createAppointment({ id: 'dup', title: 'T2', ...futureRange() }),
        /already exists/
      );
    });

    it('emits created event with timestamp', async () => {
      const events: AppointmentEvent[] = [];
      manager.on('appointment.created', (e) => {
        events.push(e);
      });
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]!.appointment.id, apt.id);
      assert.ok(!Number.isNaN(new Date(events[0]!.timestamp).getTime()));
      assert.strictEqual(events[0]!.previous, undefined);
    });
  });

  describe('get/delete', () => {
    it('returns null for unknown id', async () => {
      assert.strictEqual(await manager.getAppointment('missing'), null);
    });

    it('returns the appointment for known id', async () => {
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      const got = await manager.getAppointment(apt.id);
      assert.strictEqual(got!.id, apt.id);
    });

    it('deletes and reports true then false', async () => {
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      assert.strictEqual(await manager.deleteAppointment(apt.id), true);
      assert.strictEqual(await manager.getAppointment(apt.id), null);
      assert.strictEqual(await manager.deleteAppointment(apt.id), false);
    });
  });

  describe('state transition matrix', () => {
    it('created -> confirmed -> cancelled is allowed', async () => {
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      await manager.confirmAppointment(apt.id);
      const cancelled = await manager.cancelAppointment(apt.id);
      assert.strictEqual(cancelled.status, 'cancelled');
    });

    it('confirmed -> confirmed is rejected', async () => {
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      await manager.confirmAppointment(apt.id);
      await assert.rejects(
        manager.confirmAppointment(apt.id),
        InvalidStateTransitionError
      );
    });

    it('cancelled is terminal (confirm/cancel/reschedule all reject)', async () => {
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      await manager.cancelAppointment(apt.id);
      await assert.rejects(manager.confirmAppointment(apt.id), InvalidStateTransitionError);
      await assert.rejects(manager.cancelAppointment(apt.id), InvalidStateTransitionError);
      await assert.rejects(
        manager.rescheduleAppointment({ id: apt.id, ...futureRange() }),
        InvalidStateTransitionError
      );
    });

    it('created -> reschedule is rejected (must confirm first)', async () => {
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      await assert.rejects(
        manager.rescheduleAppointment({ id: apt.id, ...futureRange() }),
        InvalidStateTransitionError
      );
    });

    it('rescheduled -> confirmed is allowed (re-confirmation flow)', async () => {
      const apt = await manager.createAppointment({
        title: 'T',
        startsAt: new Date('2024-01-15T10:00:00Z'),
        endsAt: new Date('2024-01-15T11:00:00Z'),
      });
      await manager.confirmAppointment(apt.id);
      const rescheduled = await manager.rescheduleAppointment({
        id: apt.id,
        startsAt: new Date('2024-01-16T10:00:00Z'),
        endsAt: new Date('2024-01-16T11:00:00Z'),
      });
      assert.strictEqual(rescheduled.status, 'rescheduled');
      const reconfirmed = await manager.confirmAppointment(apt.id);
      assert.strictEqual(reconfirmed.status, 'confirmed');
    });

    it('rescheduled -> rescheduled is rejected', async () => {
      const apt = await manager.createAppointment({
        title: 'T',
        startsAt: new Date('2024-01-15T10:00:00Z'),
        endsAt: new Date('2024-01-15T11:00:00Z'),
      });
      await manager.confirmAppointment(apt.id);
      await manager.rescheduleAppointment({
        id: apt.id,
        startsAt: new Date('2024-01-16T10:00:00Z'),
        endsAt: new Date('2024-01-16T11:00:00Z'),
      });
      await assert.rejects(
        manager.rescheduleAppointment({
          id: apt.id,
          startsAt: new Date('2024-01-17T10:00:00Z'),
          endsAt: new Date('2024-01-17T11:00:00Z'),
        }),
        InvalidStateTransitionError
      );
    });

    it('rescheduled -> cancelled is allowed', async () => {
      const apt = await manager.createAppointment({
        title: 'T',
        startsAt: new Date('2024-01-15T10:00:00Z'),
        endsAt: new Date('2024-01-15T11:00:00Z'),
      });
      await manager.confirmAppointment(apt.id);
      await manager.rescheduleAppointment({
        id: apt.id,
        startsAt: new Date('2024-01-16T10:00:00Z'),
        endsAt: new Date('2024-01-16T11:00:00Z'),
      });
      const cancelled = await manager.cancelAppointment(apt.id);
      assert.strictEqual(cancelled.status, 'cancelled');
    });

    it('reschedule validates the new time range', async () => {
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      await manager.confirmAppointment(apt.id);
      await assert.rejects(
        manager.rescheduleAppointment({
          id: apt.id,
          startsAt: new Date('2024-01-16T11:00:00Z'),
          endsAt: new Date('2024-01-16T10:00:00Z'),
        }),
        /End time must be after start time/
      );
    });

    it('throws NotFound for confirm/cancel/reschedule on missing id', async () => {
      await assert.rejects(manager.confirmAppointment('nope'), AppointmentNotFoundError);
      await assert.rejects(manager.cancelAppointment('nope'), AppointmentNotFoundError);
      await assert.rejects(
        manager.rescheduleAppointment({ id: 'nope', ...futureRange() }),
        AppointmentNotFoundError
      );
    });
  });

  describe('events: on/off robustness', () => {
    it('off removes a handler', async () => {
      let calls = 0;
      const handler = () => {
        calls++;
      };
      manager.on('appointment.created', handler);
      manager.off('appointment.created', handler);
      await manager.createAppointment({ title: 'T', ...futureRange() });
      assert.strictEqual(calls, 0);
    });

    it('off on unknown event does not throw', () => {
      assert.doesNotThrow(() =>
        manager.off('appointment.created', () => {})
      );
    });

    it('on/use are chainable', () => {
      const m = createManager();
      assert.strictEqual(m.on('appointment.created', () => {}), m);
      assert.strictEqual(m.use({ name: 'x', async handle() {} }), m);
    });

    it('a throwing handler does not break creation or other handlers', async () => {
      const seen: string[] = [];
      manager.on('appointment.created', () => {
        throw new Error('handler boom');
      });
      manager.on('appointment.created', () => {
        seen.push('second');
      });
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      assert.ok(apt.id);
      assert.deepStrictEqual(seen, ['second']);
    });

    it('async handlers are awaited via events array', async () => {
      const order: string[] = [];
      manager.on('appointment.created', async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('async-handler');
      });
      await manager.createAppointment({ title: 'T', ...futureRange() });
      assert.deepStrictEqual(order, ['async-handler']);
    });
  });

  describe('transports robustness', () => {
    it('a throwing transport does not break the operation', async () => {
      const bad: TransportAdapter = {
        name: 'bad',
        async handle() {
          throw new Error('transport boom');
        },
      };
      manager.use(bad);
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      assert.ok(apt.id);
      const confirmed = await manager.confirmAppointment(apt.id);
      assert.strictEqual(confirmed.status, 'confirmed');
    });

    it('transport without events filter receives every event', async () => {
      const seen: string[] = [];
      manager.use({
        name: 'all',
        async handle(e) {
          seen.push(e.type);
        },
      });
      const apt = await manager.createAppointment({ title: 'T', ...futureRange() });
      await manager.confirmAppointment(apt.id);
      assert.deepStrictEqual(seen, ['appointment.created', 'appointment.confirmed']);
    });
  });

  describe('custom storage', () => {
    it('uses the injected storage adapter', async () => {
      const storage = new MemoryStorage();
      const m = createManager({ storage });
      const apt = await m.createAppointment({ title: 'T', ...futureRange() });
      assert.strictEqual(await storage.get(apt.id) !== null, true);
      assert.strictEqual(storage.size, 1);
    });

    it('list filters pass through to storage', async () => {
      const calls: unknown[] = [];
      const inner = new MemoryStorage();
      const spy: StorageAdapter = {
        create: (a) => inner.create(a),
        get: (id) => inner.get(id),
        update: (id, a) => inner.update(id, a),
        delete: (id) => inner.delete(id),
        list: (f) => {
          calls.push(f);
          return inner.list(f);
        },
      };
      const m = createManager({ storage: spy });
      await m.createAppointment({ title: 'T', ...futureRange() });
      await m.listAppointments({ status: 'created', limit: 5, offset: 0 });
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0], { status: 'created', limit: 5, offset: 0 });
    });
  });

  describe('close and autoExpire', () => {
    it('close without timer does not throw and is idempotent', () => {
      manager.close();
      manager.close();
    });

    it('autoExpire marks past appointments expired and emits event', async () => {
      const m = createManager({ autoExpire: true, expireCheckInterval: 10 });
      try {
        const expiredEvents: AppointmentEvent[] = [];
        m.on('appointment.expired', (e) => {
          expiredEvents.push(e);
        });

        const past = await m.createAppointment({
          title: 'Past',
          startsAt: new Date(Date.now() - 3600000),
          endsAt: new Date(Date.now() - 1000),
        });

        const deadline = Date.now() + 2000;
        while (expiredEvents.length === 0 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 20));
        }

        assert.strictEqual(expiredEvents.length, 1);
        assert.strictEqual(expiredEvents[0]!.appointment.id, past.id);
        assert.strictEqual(expiredEvents[0]!.appointment.status, 'expired');
        assert.strictEqual((await m.getAppointment(past.id))!.status, 'expired');
      } finally {
        m.close();
      }
    });

    it('autoExpire leaves future appointments alone', async () => {
      const m = createManager({ autoExpire: true, expireCheckInterval: 10 });
      try {
        const expiredEvents: AppointmentEvent[] = [];
        m.on('appointment.expired', (e) => {
          expiredEvents.push(e);
        });
        const apt = await m.createAppointment({ title: 'Future', ...futureRange() });
        await new Promise((r) => setTimeout(r, 60));
        assert.strictEqual(expiredEvents.length, 0);
        assert.strictEqual((await m.getAppointment(apt.id))!.status, 'created');
      } finally {
        m.close();
      }
    });

    it('expired appointments reject further transitions', async () => {      const m = createManager({ autoExpire: true, expireCheckInterval: 10 });
      try {
        const apt = await m.createAppointment({
          title: 'Past',
          startsAt: new Date(Date.now() - 3600000),
          endsAt: new Date(Date.now() - 1000),
        });
        const deadline = Date.now() + 2000;
        let current = await m.getAppointment(apt.id);
        while (current!.status !== 'expired' && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 20));
          current = await m.getAppointment(apt.id);
        }
        assert.strictEqual(current!.status, 'expired');
        await assert.rejects(m.confirmAppointment(apt.id), InvalidStateTransitionError);
        await assert.rejects(m.cancelAppointment(apt.id), InvalidStateTransitionError);
      } finally {
        m.close();
      }
    });

    it('autoExpire uses the default interval when none is given', async () => {
      const m = createManager({ autoExpire: true });
      try {
        const apt = await m.createAppointment({ title: 'T', ...futureRange() });
        await new Promise((r) => setTimeout(r, 30));
        // Default interval is 60s so nothing expires yet; timer exists and close clears it.
        assert.strictEqual((await m.getAppointment(apt.id))!.status, 'created');
      } finally {
        m.close();
      }
    });

    it('checkExpired ignores storage update errors', async () => {
      const inner = new MemoryStorage();
      const failingUpdate: StorageAdapter = {
        create: (a) => inner.create(a),
        get: (id) => inner.get(id),
        update: async () => {
          throw new Error('db down');
        },
        delete: (id) => inner.delete(id),
        list: (f) => inner.list(f),
      };
      const m = createManager({ storage: failingUpdate, autoExpire: true, expireCheckInterval: 10 });
      try {
        const expiredEvents: AppointmentEvent[] = [];
        m.on('appointment.expired', (e) => {
          expiredEvents.push(e);
        });
        await m.createAppointment({
          title: 'Past',
          startsAt: new Date(Date.now() - 3600000),
          endsAt: new Date(Date.now() - 1000),
        });
        // Give the timer several ticks; the update always throws and must be swallowed.
        await new Promise((r) => setTimeout(r, 80));
        assert.strictEqual(expiredEvents.length, 0);
      } finally {
        m.close();
      }
    });
  });
});
