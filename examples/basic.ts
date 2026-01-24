import { createManager } from '../src/index.js';

async function main() {
  const manager = createManager();

  // Listen to events
  manager.on('appointment.created', (event) => {
    console.log('📅 Created:', event.appointment.title);
  });

  manager.on('appointment.confirmed', (event) => {
    console.log('✓ Confirmed:', event.appointment.id);
  });

  manager.on('appointment.rescheduled', (event) => {
    console.log('↻ Rescheduled:', event.appointment.id);
    console.log('  From:', event.previous?.startsAt);
    console.log('  To:', event.appointment.startsAt);
  });

  manager.on('appointment.cancelled', (event) => {
    console.log('✗ Cancelled:', event.appointment.id);
  });

  // Create an appointment
  const appointment = await manager.createAppointment({
    title: 'Team Standup',
    description: 'Daily sync meeting',
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // +30 min
    metadata: {
      organizer: 'alice@example.com',
      attendees: ['bob@example.com', 'charlie@example.com'],
    },
  });

  console.log('\nAppointment object:', appointment);

  // Confirm it
  await manager.confirmAppointment(appointment.id);

  // Reschedule it
  await manager.rescheduleAppointment({
    id: appointment.id,
    startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // Day after tomorrow
    endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000 + 30 * 60 * 1000),
  });

  // Confirm the rescheduled appointment
  await manager.confirmAppointment(appointment.id);

  // List all appointments
  const all = await manager.listAppointments();
  console.log('\nAll appointments:', all.length);

  // List only confirmed
  const confirmed = await manager.listAppointments({ status: 'confirmed' });
  console.log('Confirmed appointments:', confirmed.length);

  // Cancel it
  await manager.cancelAppointment(appointment.id);

  // Final state
  const final = await manager.getAppointment(appointment.id);
  console.log('\nFinal state:', final?.status);

  manager.close();
}

main().catch(console.error);
