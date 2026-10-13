# Reservo

[![CI](https://github.com/Artflarex-Limited/reservo/actions/workflows/ci.yml/badge.svg)](https://github.com/Artflarex-Limited/reservo/actions/workflows/ci.yml)

Lightweight appointment management for Node.js applications.

Reservo is an infrastructure-level library for managing appointments programmatically. It handles appointment lifecycle, storage, and optional notifications—without imposing UI, authentication, or business logic.

```typescript
import { createManager } from '@artflarex-solutions/reservo';

const manager = createManager();

const appointment = await manager.createAppointment({
  title: 'Team Standup',
  startsAt: new Date('2024-01-15T09:00:00Z'),
  endsAt: new Date('2024-01-15T09:30:00Z'),
});

await manager.confirmAppointment(appointment.id);
```

## Installation

```bash
npm install @artflarex-solutions/reservo
```

## Requirements

- Node.js >= 24.0.0

## Features

- **TypeScript-first** with full type definitions
- **Zero dependencies** in core
- **UTC by default** for predictable time handling
- **Explicit lifecycle** with enforced state transitions
- **Pluggable storage** (in-memory default, bring your own adapter)
- **Pluggable transports** for notifications (SMTP, webhooks, etc.)
- **Event-driven** architecture

## Quick Start

### Create and Manage Appointments

```typescript
import { createManager } from '@artflarex-solutions/reservo';

const manager = createManager();

// Create
const apt = await manager.createAppointment({
  title: 'Doctor Visit',
  startsAt: '2024-02-01T14:00:00Z',
  endsAt: '2024-02-01T14:30:00Z',
  metadata: { patientId: '12345', email: 'patient@example.com' },
});

// Confirm
await manager.confirmAppointment(apt.id);

// Reschedule
await manager.rescheduleAppointment({
  id: apt.id,
  startsAt: '2024-02-02T14:00:00Z',
  endsAt: '2024-02-02T14:30:00Z',
});

// Cancel
await manager.cancelAppointment(apt.id);
```

### Listen to Events

```typescript
manager.on('appointment.created', (event) => {
  console.log('New appointment:', event.appointment.title);
});

manager.on('appointment.confirmed', (event) => {
  console.log('Confirmed:', event.appointment.id);
});

manager.on('appointment.cancelled', (event) => {
  console.log('Cancelled:', event.appointment.id);
});

manager.on('appointment.rescheduled', (event) => {
  console.log('Rescheduled from:', event.previous?.startsAt);
  console.log('Rescheduled to:', event.appointment.startsAt);
});
```

### Add Email Notifications

```typescript
import { createManager } from '@artflarex-solutions/reservo';
import { createSMTPTransport } from '@artflarex-solutions/reservo/transports/smtp';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'user', pass: 'pass' },
});

const manager = createManager();

manager.use(
  createSMTPTransport({
    transporter,
    from: 'appointments@example.com',
    template: (event) => ({
      to: event.appointment.metadata?.email as string,
      subject: `Appointment ${event.type.split('.')[1]}: ${event.appointment.title}`,
      text: `Your appointment "${event.appointment.title}" scheduled for ${event.appointment.startsAt} has been ${event.type.split('.')[1]}.`,
    }),
  })
);
```

## API Reference

### `createManager(options?)`

Create an appointment manager instance.

**Options:**
- `storage` - Custom storage adapter (default: in-memory)
- `autoExpire` - Enable automatic expiration checking (default: false)
- `expireCheckInterval` - Interval for expiration checks in ms (default: 60000)

### Manager Methods

| Method | Description |
|--------|-------------|
| `createAppointment(input)` | Create a new appointment |
| `confirmAppointment(id)` | Confirm an appointment |
| `cancelAppointment(id)` | Cancel an appointment |
| `rescheduleAppointment(input)` | Reschedule to new times |
| `getAppointment(id)` | Get appointment by ID |
| `listAppointments(filters?)` | List with optional filters |
| `deleteAppointment(id)` | Delete an appointment |
| `on(event, handler)` | Register event handler |
| `off(event, handler)` | Remove event handler |
| `use(adapter)` | Register transport adapter |
| `close()` | Clean up resources |

### Appointment Lifecycle

```
created → confirmed → cancelled
    ↓         ↓
    ↓     rescheduled → confirmed
    ↓         ↓
    └→ expired ←┘
```

**States:**
- `created` - Initial state
- `confirmed` - Appointment confirmed
- `cancelled` - Appointment cancelled (terminal)
- `rescheduled` - Times changed, needs re-confirmation
- `expired` - Past end time (terminal)

### Appointment Object

```typescript
interface Appointment {
  id: string;           // UUID v4
  title: string;
  description?: string;
  startsAt: string;     // ISO 8601 UTC
  endsAt: string;       // ISO 8601 UTC
  status: AppointmentStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;    // ISO 8601 UTC
  updatedAt: string;    // ISO 8601 UTC
}
```

### Events

| Event | Description |
|-------|-------------|
| `appointment.created` | New appointment created |
| `appointment.confirmed` | Appointment confirmed |
| `appointment.cancelled` | Appointment cancelled |
| `appointment.rescheduled` | Appointment times changed |
| `appointment.expired` | Appointment past end time |

## Custom Storage Adapter

Implement the `StorageAdapter` interface for custom persistence:

```typescript
import type { StorageAdapter, Appointment, AppointmentFilters } from '@artflarex-solutions/reservo';

class PostgresStorage implements StorageAdapter {
  async create(appointment: Appointment): Promise<Appointment> {
    // INSERT INTO appointments ...
  }

  async get(id: string): Promise<Appointment | null> {
    // SELECT * FROM appointments WHERE id = $1
  }

  async update(id: string, appointment: Appointment): Promise<Appointment> {
    // UPDATE appointments SET ... WHERE id = $1
  }

  async delete(id: string): Promise<boolean> {
    // DELETE FROM appointments WHERE id = $1
  }

  async list(filters?: AppointmentFilters): Promise<Appointment[]> {
    // SELECT * FROM appointments WHERE ...
  }
}

const manager = createManager({ storage: new PostgresStorage() });
```

## Custom Transport Adapter

Implement the `TransportAdapter` interface for custom notifications:

```typescript
import type { TransportAdapter, AppointmentEvent } from '@artflarex-solutions/reservo';

const webhookTransport: TransportAdapter = {
  name: 'webhook',
  events: ['appointment.confirmed', 'appointment.cancelled'],

  async handle(event: AppointmentEvent): Promise<void> {
    await fetch('https://api.example.com/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  },
};

manager.use(webhookTransport);
```

## Time Handling

All times are stored and processed in UTC. Input accepts:
- `Date` objects
- ISO 8601 strings
- Unix timestamps (milliseconds)

```typescript
// All equivalent
await manager.createAppointment({
  title: 'Meeting',
  startsAt: new Date('2024-01-15T10:00:00Z'),
  endsAt: new Date('2024-01-15T11:00:00Z'),
});

await manager.createAppointment({
  title: 'Meeting',
  startsAt: '2024-01-15T10:00:00Z',
  endsAt: '2024-01-15T11:00:00Z',
});

await manager.createAppointment({
  title: 'Meeting',
  startsAt: 1705316400000,
  endsAt: 1705320000000,
});
```

## Development

```bash
npm ci
npm test              # fast unit tests (node:test + tsx)
npm run test:coverage # full suite with 100% statements/branches/functions/lines enforced via c8
npm run typecheck
npm run build
```

CI runs typecheck, coverage, and build on Node 24, 25, and 26 for every push and pull request.

## License

MIT
