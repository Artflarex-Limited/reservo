import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  AppointmentManager,
  createManager,
  MemoryStorage,
  AppointmentError,
  AppointmentNotFoundError,
  InvalidStateTransitionError,
  ValidationError,
} from './index.js';

describe('index barrel exports', () => {
  it('exposes manager, storage, and errors', () => {
    assert.ok(typeof createManager === 'function');
    assert.ok(typeof AppointmentManager === 'function');
    assert.ok(typeof MemoryStorage === 'function');
    assert.ok(typeof AppointmentError === 'function');
    assert.ok(typeof AppointmentNotFoundError === 'function');
    assert.ok(typeof InvalidStateTransitionError === 'function');
    assert.ok(typeof ValidationError === 'function');
  });

  it('creates a working manager through the barrel', async () => {
    const manager = createManager();
    const apt = await manager.createAppointment({
      title: 'Barrel Test',
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
    });
    assert.strictEqual(apt.status, 'created');
    const confirmed = await manager.confirmAppointment(apt.id);
    assert.strictEqual(confirmed.status, 'confirmed');
    manager.close();
  });
});
