import type {
  Appointment,
  AppointmentEvent,
  AppointmentEventHandler,
  AppointmentEventType,
  AppointmentFilters,
  AppointmentManagerOptions,
  AppointmentStatus,
  CreateAppointmentInput,
  RescheduleAppointmentInput,
  StorageAdapter,
  TransportAdapter,
} from './types.js';
import { MemoryStorage } from './storage/memory.js';
import {
  AppointmentNotFoundError,
  InvalidStateTransitionError,
  ValidationError,
} from './errors.js';
import { generateId, isPast, nowUTC, toUTCString, validateTimeRange } from './utils.js';

/**
 * Valid state transitions for appointments.
 */
const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  created: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['cancelled', 'rescheduled', 'expired'],
  cancelled: [],
  rescheduled: ['confirmed', 'cancelled', 'expired'],
  expired: [],
};

/**
 * Core appointment manager.
 * Manages appointment lifecycle, storage, and event dispatching.
 */
export class AppointmentManager {
  private storage: StorageAdapter;
  private transports: TransportAdapter[] = [];
  private handlers: Map<AppointmentEventType, Set<AppointmentEventHandler>> = new Map();
  private expireTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: AppointmentManagerOptions = {}) {
    this.storage = options.storage ?? new MemoryStorage();

    if (options.autoExpire) {
      const interval = options.expireCheckInterval ?? 60000;
      this.expireTimer = setInterval(() => this.checkExpired(), interval);
      this.expireTimer.unref?.();
    }
  }

  /**
   * Register a transport adapter.
   */
  use(adapter: TransportAdapter): this {
    this.transports.push(adapter);
    return this;
  }

  /**
   * Register an event handler.
   */
  on(event: AppointmentEventType, handler: AppointmentEventHandler): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Remove an event handler.
   */
  off(event: AppointmentEventType, handler: AppointmentEventHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  /**
   * Create a new appointment.
   */
  async createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
    const id = input.id ?? generateId();
    const now = nowUTC();
    const startsAt = toUTCString(input.startsAt);
    const endsAt = toUTCString(input.endsAt);

    validateTimeRange(startsAt, endsAt);

    if (!input.title || input.title.trim().length === 0) {
      throw new ValidationError('Title is required', 'title');
    }

    const appointment: Appointment = {
      id,
      title: input.title.trim(),
      description: input.description?.trim(),
      startsAt,
      endsAt,
      status: 'created',
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.storage.create(appointment);
    await this.emit('appointment.created', created);
    return created;
  }

  /**
   * Confirm an appointment.
   */
  async confirmAppointment(id: string): Promise<Appointment> {
    const appointment = await this.getOrThrow(id);
    this.assertTransition(appointment.status, 'confirmed');

    const updated: Appointment = {
      ...appointment,
      status: 'confirmed',
      updatedAt: nowUTC(),
    };

    const result = await this.storage.update(id, updated);
    await this.emit('appointment.confirmed', result);
    return result;
  }

  /**
   * Cancel an appointment.
   */
  async cancelAppointment(id: string): Promise<Appointment> {
    const appointment = await this.getOrThrow(id);
    this.assertTransition(appointment.status, 'cancelled');

    const updated: Appointment = {
      ...appointment,
      status: 'cancelled',
      updatedAt: nowUTC(),
    };

    const result = await this.storage.update(id, updated);
    await this.emit('appointment.cancelled', result);
    return result;
  }

  /**
   * Reschedule an appointment to new times.
   */
  async rescheduleAppointment(input: RescheduleAppointmentInput): Promise<Appointment> {
    const appointment = await this.getOrThrow(input.id);
    this.assertTransition(appointment.status, 'rescheduled');

    const startsAt = toUTCString(input.startsAt);
    const endsAt = toUTCString(input.endsAt);
    validateTimeRange(startsAt, endsAt);

    const previous = { ...appointment };
    const updated: Appointment = {
      ...appointment,
      startsAt,
      endsAt,
      status: 'rescheduled',
      updatedAt: nowUTC(),
    };

    const result = await this.storage.update(input.id, updated);
    await this.emit('appointment.rescheduled', result, previous);
    return result;
  }

  /**
   * Get an appointment by ID.
   */
  async getAppointment(id: string): Promise<Appointment | null> {
    return this.storage.get(id);
  }

  /**
   * List appointments with optional filters.
   */
  async listAppointments(filters?: AppointmentFilters): Promise<Appointment[]> {
    return this.storage.list(filters);
  }

  /**
   * Delete an appointment.
   */
  async deleteAppointment(id: string): Promise<boolean> {
    return this.storage.delete(id);
  }

  /**
   * Stop the manager and clean up resources.
   */
  close(): void {
    if (this.expireTimer) {
      clearInterval(this.expireTimer);
      this.expireTimer = null;
    }
  }

  /**
   * Check for and mark expired appointments.
   */
  private async checkExpired(): Promise<void> {
    const appointments = await this.storage.list({
      status: ['created', 'confirmed', 'rescheduled'],
    });

    const now = Date.now();
    for (const appointment of appointments) {
      if (new Date(appointment.endsAt).getTime() < now) {
        try {
          const updated: Appointment = {
            ...appointment,
            status: 'expired',
            updatedAt: nowUTC(),
          };
          await this.storage.update(appointment.id, updated);
          await this.emit('appointment.expired', updated);
        } catch {
          // Ignore errors during expiration check
        }
      }
    }
  }

  private async getOrThrow(id: string): Promise<Appointment> {
    const appointment = await this.storage.get(id);
    if (!appointment) {
      throw new AppointmentNotFoundError(id);
    }
    return appointment;
  }

  private assertTransition(current: AppointmentStatus, target: AppointmentStatus): void {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new InvalidStateTransitionError(current, target);
    }
  }

  private async emit(
    type: AppointmentEventType,
    appointment: Appointment,
    previous?: Appointment
  ): Promise<void> {
    const event: AppointmentEvent = {
      type,
      appointment,
      previous,
      timestamp: nowUTC(),
    };

    // Call registered handlers
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch {
          // Handlers should not throw, but we don't want to break the flow
        }
      }
    }

    // Call transports
    for (const transport of this.transports) {
      if (!transport.events || transport.events.includes(type)) {
        try {
          await transport.handle(event);
        } catch {
          // Transports should not throw, but we don't want to break the flow
        }
      }
    }
  }
}

/**
 * Create an appointment manager instance.
 * This is the main entry point for the library.
 *
 * @example
 * ```typescript
 * import { createManager } from 'reservo';
 *
 * const manager = createManager();
 *
 * const appointment = await manager.createAppointment({
 *   title: 'Team Meeting',
 *   startsAt: new Date('2024-01-15T10:00:00Z'),
 *   endsAt: new Date('2024-01-15T11:00:00Z'),
 * });
 * ```
 */
export function createManager(options?: AppointmentManagerOptions): AppointmentManager {
  return new AppointmentManager(options);
}
