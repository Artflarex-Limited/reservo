import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  AppointmentError,
  AppointmentNotFoundError,
  InvalidStateTransitionError,
  ValidationError,
} from './errors.js';

describe('errors', () => {
  it('AppointmentError is an Error with correct name', () => {
    const err = new AppointmentError('boom');
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'AppointmentError');
    assert.strictEqual(err.message, 'boom');
  });

  it('AppointmentNotFoundError carries id', () => {
    const err = new AppointmentNotFoundError('abc-123');
    assert.ok(err instanceof AppointmentError);
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'AppointmentNotFoundError');
    assert.strictEqual(err.id, 'abc-123');
    assert.strictEqual(err.message, 'Appointment not found: abc-123');
  });

  it('InvalidStateTransitionError carries statuses', () => {
    const err = new InvalidStateTransitionError('cancelled', 'confirmed');
    assert.ok(err instanceof AppointmentError);
    assert.strictEqual(err.name, 'InvalidStateTransitionError');
    assert.strictEqual(err.currentStatus, 'cancelled');
    assert.strictEqual(err.targetStatus, 'confirmed');
    assert.strictEqual(
      err.message,
      'Invalid state transition: cancelled -> confirmed'
    );
  });

  it('ValidationError carries field when given', () => {
    const err = new ValidationError('Title is required', 'title');
    assert.ok(err instanceof AppointmentError);
    assert.strictEqual(err.name, 'ValidationError');
    assert.strictEqual(err.field, 'title');
    assert.strictEqual(err.message, 'Title is required');
  });

  it('ValidationError field is undefined when omitted', () => {
    const err = new ValidationError('bad');
    assert.strictEqual(err.field, undefined);
  });
});
