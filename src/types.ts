/**
 * Appointment lifecycle states.
 * Transitions are enforced by the manager.
 */
export type AppointmentStatus =
  | 'created'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'expired';

/**
 * Core appointment object.
 * All times are stored as ISO 8601 UTC strings.
 */
export interface Appointment {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Appointment title or subject */
  title: string;
  /** Optional description */
  description?: string | undefined;
  /** Start time in ISO 8601 UTC format */
  startsAt: string;
  /** End time in ISO 8601 UTC format */
  endsAt: string;
  /** Current lifecycle status */
  status: AppointmentStatus;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown> | undefined;
  /** Creation timestamp in ISO 8601 UTC format */
  createdAt: string;
  /** Last update timestamp in ISO 8601 UTC format */
  updatedAt: string;
}

/**
 * Input for creating a new appointment.
 */
export interface CreateAppointmentInput {
  title: string;
  description?: string;
  /** Start time - accepts Date, ISO string, or Unix timestamp (ms) */
  startsAt: Date | string | number;
  /** End time - accepts Date, ISO string, or Unix timestamp (ms) */
  endsAt: Date | string | number;
  /** Optional custom ID (UUID v4 generated if omitted) */
  id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input for rescheduling an appointment.
 */
export interface RescheduleAppointmentInput {
  id: string;
  startsAt: Date | string | number;
  endsAt: Date | string | number;
}

/**
 * Event types emitted by the appointment manager.
 */
export type AppointmentEventType =
  | 'appointment.created'
  | 'appointment.confirmed'
  | 'appointment.cancelled'
  | 'appointment.rescheduled'
  | 'appointment.expired';

/**
 * Event payload passed to handlers.
 */
export interface AppointmentEvent {
  type: AppointmentEventType;
  appointment: Appointment;
  /** Previous state for rescheduled events */
  previous?: Appointment | undefined;
  timestamp: string;
}

/**
 * Event handler function signature.
 */
export type AppointmentEventHandler = (event: AppointmentEvent) => void | Promise<void>;

/**
 * Storage adapter interface.
 * Implement this to add custom persistence (PostgreSQL, Redis, etc.).
 */
export interface StorageAdapter {
  /** Store a new appointment */
  create(appointment: Appointment): Promise<Appointment>;
  /** Retrieve an appointment by ID */
  get(id: string): Promise<Appointment | null>;
  /** Update an existing appointment */
  update(id: string, appointment: Appointment): Promise<Appointment>;
  /** Delete an appointment */
  delete(id: string): Promise<boolean>;
  /** List appointments with optional filters */
  list(filters?: AppointmentFilters): Promise<Appointment[]>;
}

/**
 * Filters for listing appointments.
 */
export interface AppointmentFilters {
  status?: AppointmentStatus | AppointmentStatus[];
  /** Start of time range (inclusive) */
  from?: Date | string | number;
  /** End of time range (inclusive) */
  to?: Date | string | number;
  limit?: number;
  offset?: number;
}

/**
 * Transport adapter interface.
 * Implement this to add side effects (email, SMS, webhooks, etc.).
 */
export interface TransportAdapter {
  /** Human-readable name for logging */
  name: string;
  /** Handle an appointment event */
  handle(event: AppointmentEvent): Promise<void>;
  /** Optional: filter which events this transport handles */
  events?: AppointmentEventType[] | undefined;
}

/**
 * Configuration options for the appointment manager.
 */
export interface AppointmentManagerOptions {
  /** Custom storage adapter (defaults to in-memory) */
  storage?: StorageAdapter;
  /** Enable automatic expiration checking */
  autoExpire?: boolean;
  /** Interval for expiration checks in milliseconds (default: 60000) */
  expireCheckInterval?: number;
}
