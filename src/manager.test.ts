import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AppointmentManager, createManager } from './manager.js';
import { MemoryStorage } from './storage/memory.js';
import {
  AppointmentNotFoundError,
  InvalidStateTransitionError,
  ValidationError,
} from './errors.js';
import type { AppointmentEvent, TransportAdapter } from './types.js';

describe('AppointmentManager', () => {
  let manager: AppointmentManager;

  beforeEach(() => {
    manager = createManager();
  });

  describe('createAppointment', () => {
    it('creates an appointment with valid input', async () => {
      const apt = await manager.createAppointment({
        title: 'Test Meeting',
        startsAt: new Date('2024-01-15T10:00:00Z'),
        endsAt: new Date('2024-01-15T11:00:00Z'),
      });

      assert.strictEqual(apt.title, 'Test Meeting');
      assert.strictEqual(apt.status, 'created');
      assert.strictEqual(apt.startsAt, '2024-01-15T10:00:00.000Z');
      assert.strictEqual(apt.endsAt, '2024-01-15T11:00:00.000Z');
      assert.ok(apt.id);
      assert.ok(apt.createdAt);
      assert.ok(apt.updatedAt);
    });

    it('accepts ISO string dates', async () => {
      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: '2024-01-15T10:00:00Z',
        endsAt: '2024-01-15T11:00:00Z',
      });

      assert.strictEqual(apt.startsAt, '2024-01-15T10:00:00.000Z');
    });

    it('accepts Unix timestamps', async () => {
      const start = new Date('2024-01-15T10:00:00Z').getTime();
      const end = new Date('2024-01-15T11:00:00Z').getTime();

      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: start,
        endsAt: end,
      });

      assert.strictEqual(apt.startsAt, '2024-01-15T10:00:00.000Z');
    });

    it('throws ValidationError for empty title', async () => {
      await assert.rejects(
        manager.createAppointment({
          title: '',
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 3600000),
        }),
        ValidationError
      );
    });

    it('throws error when end is before start', async () => {
      await assert.rejects(
        manager.createAppointment({
          title: 'Test',
          startsAt: new Date('2024-01-15T11:00:00Z'),
          endsAt: new Date('2024-01-15T10:00:00Z'),
        }),
        /End time must be after start time/
      );
    });

    it('stores metadata', async () => {
      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
        metadata: { key: 'value', nested: { a: 1 } },
      });

      assert.deepStrictEqual(apt.metadata, { key: 'value', nested: { a: 1 } });
    });
  });

  describe('confirmAppointment', () => {
    it('confirms a created appointment', async () => {
      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });

      const confirmed = await manager.confirmAppointment(apt.id);

      assert.strictEqual(confirmed.status, 'confirmed');
      assert.ok(confirmed.updatedAt);
    });

    it('throws AppointmentNotFoundError for invalid id', async () => {
      await assert.rejects(
        manager.confirmAppointment('non-existent-id'),
        AppointmentNotFoundError
      );
    });

    it('throws InvalidStateTransitionError for cancelled appointment', async () => {
      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });
      await manager.cancelAppointment(apt.id);

      await assert.rejects(
        manager.confirmAppointment(apt.id),
        InvalidStateTransitionError
      );
    });
  });

  describe('cancelAppointment', () => {
    it('cancels a created appointment', async () => {
      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });

      const cancelled = await manager.cancelAppointment(apt.id);

      assert.strictEqual(cancelled.status, 'cancelled');
    });

    it('cancels a confirmed appointment', async () => {
      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });
      await manager.confirmAppointment(apt.id);

      const cancelled = await manager.cancelAppointment(apt.id);

      assert.strictEqual(cancelled.status, 'cancelled');
    });
  });

  describe('rescheduleAppointment', () => {
    it('reschedules a confirmed appointment', async () => {
      const apt = await manager.createAppointment({
        title: 'Test',
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
      assert.strictEqual(rescheduled.startsAt, '2024-01-16T10:00:00.000Z');
    });

    it('throws InvalidStateTransitionError for created appointment', async () => {
      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });

      await assert.rejects(
        manager.rescheduleAppointment({
          id: apt.id,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 3600000),
        }),
        InvalidStateTransitionError
      );
    });
  });

  describe('listAppointments', () => {
    it('lists all appointments', async () => {
      await manager.createAppointment({
        title: 'Test 1',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });
      await manager.createAppointment({
        title: 'Test 2',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });

      const all = await manager.listAppointments();

      assert.strictEqual(all.length, 2);
    });

    it('filters by status', async () => {
      const apt1 = await manager.createAppointment({
        title: 'Test 1',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });
      await manager.createAppointment({
        title: 'Test 2',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });
      await manager.confirmAppointment(apt1.id);

      const confirmed = await manager.listAppointments({ status: 'confirmed' });

      assert.strictEqual(confirmed.length, 1);
      assert.strictEqual(confirmed[0]?.title, 'Test 1');
    });
  });

  describe('events', () => {
    it('emits appointment.created event', async () => {
      const events: AppointmentEvent[] = [];
      manager.on('appointment.created', (e) => { events.push(e); });

      await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'appointment.created');
    });

    it('emits appointment.rescheduled with previous state', async () => {
      const events: AppointmentEvent[] = [];
      manager.on('appointment.rescheduled', (e) => { events.push(e); });

      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: new Date('2024-01-15T10:00:00Z'),
        endsAt: new Date('2024-01-15T11:00:00Z'),
      });
      await manager.confirmAppointment(apt.id);
      await manager.rescheduleAppointment({
        id: apt.id,
        startsAt: new Date('2024-01-16T10:00:00Z'),
        endsAt: new Date('2024-01-16T11:00:00Z'),
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.previous?.startsAt, '2024-01-15T10:00:00.000Z');
      assert.strictEqual(events[0]?.appointment.startsAt, '2024-01-16T10:00:00.000Z');
    });
  });

  describe('transports', () => {
    it('calls transport on events', async () => {
      const handled: AppointmentEvent[] = [];
      const transport: TransportAdapter = {
        name: 'test',
        async handle(event) {
          handled.push(event);
        },
      };

      manager.use(transport);

      await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });

      assert.strictEqual(handled.length, 1);
    });

    it('respects transport event filter', async () => {
      const handled: AppointmentEvent[] = [];
      const transport: TransportAdapter = {
        name: 'test',
        events: ['appointment.confirmed'],
        async handle(event) {
          handled.push(event);
        },
      };

      manager.use(transport);

      const apt = await manager.createAppointment({
        title: 'Test',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      });

      assert.strictEqual(handled.length, 0);

      await manager.confirmAppointment(apt.id);

      assert.strictEqual(handled.length, 1);
      assert.strictEqual(handled[0]?.type, 'appointment.confirmed');
    });
  });
});

describe('MemoryStorage', () => {
  it('clears storage', async () => {
    const storage = new MemoryStorage();
    await storage.create({
      id: 'test-1',
      title: 'Test',
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.strictEqual(storage.size, 1);

    storage.clear();

    assert.strictEqual(storage.size, 0);
  });
});
