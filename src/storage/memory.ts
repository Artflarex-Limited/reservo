import type { Appointment, AppointmentFilters, StorageAdapter } from '../types.js';

/**
 * In-memory storage adapter.
 * Default storage implementation. Data is lost on process restart.
 */
export class MemoryStorage implements StorageAdapter {
  private store: Map<string, Appointment> = new Map();

  async create(appointment: Appointment): Promise<Appointment> {
    if (this.store.has(appointment.id)) {
      throw new Error(`Appointment already exists: ${appointment.id}`);
    }
    this.store.set(appointment.id, { ...appointment });
    return { ...appointment };
  }

  async get(id: string): Promise<Appointment | null> {
    const appointment = this.store.get(id);
    return appointment ? { ...appointment } : null;
  }

  async update(id: string, appointment: Appointment): Promise<Appointment> {
    if (!this.store.has(id)) {
      throw new Error(`Appointment not found: ${id}`);
    }
    this.store.set(id, { ...appointment });
    return { ...appointment };
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async list(filters?: AppointmentFilters): Promise<Appointment[]> {
    let results = Array.from(this.store.values());

    if (filters) {
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        results = results.filter((a) => statuses.includes(a.status));
      }

      if (filters.from !== undefined) {
        const fromTime = new Date(filters.from).getTime();
        results = results.filter((a) => new Date(a.startsAt).getTime() >= fromTime);
      }

      if (filters.to !== undefined) {
        const toTime = new Date(filters.to).getTime();
        results = results.filter((a) => new Date(a.endsAt).getTime() <= toTime);
      }

      results.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      if (filters.offset !== undefined) {
        results = results.slice(filters.offset);
      }

      if (filters.limit !== undefined) {
        results = results.slice(0, filters.limit);
      }
    }

    return results.map((a) => ({ ...a }));
  }

  /**
   * Clear all appointments. Useful for testing.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the number of stored appointments.
   */
  get size(): number {
    return this.store.size;
  }
}
