import { randomUUID } from 'node:crypto';

/**
 * Generate a UUID v4.
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Convert any time input to ISO 8601 UTC string.
 * Accepts Date, ISO string, or Unix timestamp in milliseconds.
 */
export function toUTCString(input: Date | string | number): string {
  let date: Date;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'string') {
    date = new Date(input);
  } else if (typeof input === 'number') {
    date = new Date(input);
  } else {
    throw new Error(`Invalid time input: ${String(input)}`);
  }

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(input)}`);
  }

  return date.toISOString();
}

/**
 * Get current UTC timestamp as ISO string.
 */
export function nowUTC(): string {
  return new Date().toISOString();
}

/**
 * Check if a date string is in the past.
 */
export function isPast(isoString: string): boolean {
  return new Date(isoString).getTime() < Date.now();
}

/**
 * Validate that end time is after start time.
 */
export function validateTimeRange(startsAt: string, endsAt: string): void {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (end <= start) {
    throw new Error('End time must be after start time');
  }
}

/**
 * Validate UUID format.
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
