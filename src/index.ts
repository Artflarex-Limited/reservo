export { AppointmentManager, createManager } from './manager.js';
export { MemoryStorage } from './storage/memory.js';
export {
  AppointmentError,
  AppointmentNotFoundError,
  InvalidStateTransitionError,
  ValidationError,
} from './errors.js';
export type {
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
