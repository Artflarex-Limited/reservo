/**
 * Base error class for appointment-related errors.
 */
export class AppointmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppointmentError';
  }
}

/**
 * Thrown when an appointment is not found.
 */
export class AppointmentNotFoundError extends AppointmentError {
  public readonly id: string;

  constructor(id: string) {
    super(`Appointment not found: ${id}`);
    this.name = 'AppointmentNotFoundError';
    this.id = id;
  }
}

/**
 * Thrown when a state transition is invalid.
 */
export class InvalidStateTransitionError extends AppointmentError {
  public readonly currentStatus: string;
  public readonly targetStatus: string;

  constructor(currentStatus: string, targetStatus: string) {
    super(`Invalid state transition: ${currentStatus} -> ${targetStatus}`);
    this.name = 'InvalidStateTransitionError';
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
  }
}

/**
 * Thrown when input validation fails.
 */
export class ValidationError extends AppointmentError {
  public readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}
