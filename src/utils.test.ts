import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateId,
  isPast,
  isValidUUID,
  nowUTC,
  toUTCString,
  validateTimeRange,
} from './utils.js';

describe('utils', () => {
  describe('generateId', () => {
    it('generates a valid UUID v4', () => {
      assert.match(
        generateId(),
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('generates unique ids', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      assert.strictEqual(ids.size, 100);
    });
  });

  describe('toUTCString', () => {
    it('converts Date objects', () => {
      assert.strictEqual(
        toUTCString(new Date('2024-01-15T10:00:00Z')),
        '2024-01-15T10:00:00.000Z'
      );
    });

    it('converts ISO strings', () => {
      assert.strictEqual(
        toUTCString('2024-01-15T10:00:00Z'),
        '2024-01-15T10:00:00.000Z'
      );
    });

    it('converts Unix timestamps (ms)', () => {
      const ms = new Date('2024-01-15T10:00:00Z').getTime();
      assert.strictEqual(toUTCString(ms), '2024-01-15T10:00:00.000Z');
    });

    it('normalizes non-UTC offsets to UTC', () => {
      // +02:00 => 08:00Z
      assert.strictEqual(
        toUTCString('2024-01-15T10:00:00+02:00'),
        '2024-01-15T08:00:00.000Z'
      );
    });

    it('throws on invalid date string', () => {
      assert.throws(() => toUTCString('not-a-date'), /Invalid date/);
    });

    it('throws on invalid input type', () => {
      assert.throws(
        // @ts-expect-error runtime guard
        () => toUTCString(null),
        /Invalid time input/
      );
      assert.throws(
        // @ts-expect-error runtime guard
        () => toUTCString({}),
        /Invalid time input/
      );
      assert.throws(
        // @ts-expect-error runtime guard
        () => toUTCString(undefined),
        /Invalid time input/
      );
    });

    it('throws on NaN timestamp', () => {
      assert.throws(() => toUTCString(NaN), /Invalid date/);
    });
  });

  describe('nowUTC', () => {
    it('returns a parseable ISO string close to now', () => {
      const before = Date.now();
      const now = nowUTC();
      const after = Date.now();
      const parsed = new Date(now).getTime();
      assert.ok(!Number.isNaN(parsed));
      assert.ok(parsed >= before && parsed <= after);
    });
  });

  describe('isPast', () => {
    it('returns true for past dates', () => {
      assert.strictEqual(isPast('2000-01-01T00:00:00.000Z'), true);
    });

    it('returns false for future dates', () => {
      assert.strictEqual(isPast(new Date(Date.now() + 3600000).toISOString()), false);
    });
  });

  describe('validateTimeRange', () => {
    it('does not throw for valid range', () => {
      assert.doesNotThrow(() =>
        validateTimeRange('2024-01-15T10:00:00.000Z', '2024-01-15T11:00:00.000Z')
      );
    });

    it('throws when end is before start', () => {
      assert.throws(
        () =>
          validateTimeRange(
            '2024-01-15T11:00:00.000Z',
            '2024-01-15T10:00:00.000Z'
          ),
        /End time must be after start time/
      );
    });

    it('throws when end equals start', () => {
      assert.throws(
        () =>
          validateTimeRange(
            '2024-01-15T10:00:00.000Z',
            '2024-01-15T10:00:00.000Z'
          ),
        /End time must be after start time/
      );
    });
  });

  describe('isValidUUID', () => {
    it('accepts valid v4 UUIDs', () => {
      assert.strictEqual(isValidUUID(generateId()), true);
      assert.strictEqual(
        isValidUUID('123e4567-e89b-42d3-a456-426614174000'),
        true
      );
    });

    it('accepts uppercase UUIDs', () => {
      assert.strictEqual(
        isValidUUID('123E4567-E89B-42D3-A456-426614174000'),
        true
      );
    });

    it('rejects non-v4 versions', () => {
      // version digit 1 instead of 4
      assert.strictEqual(
        isValidUUID('123e4567-e89b-12d3-a456-426614174000'),
        false
      );
    });

    it('rejects malformed strings', () => {
      assert.strictEqual(isValidUUID(''), false);
      assert.strictEqual(isValidUUID('not-a-uuid'), false);
      assert.strictEqual(isValidUUID('123e4567-e89b-42d3-a456'), false);
    });
  });
});
