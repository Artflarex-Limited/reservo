/**
 * Example: Using SMTP transport for email notifications.
 *
 * Prerequisites:
 *   npm install nodemailer
 *   npm install --save-dev @types/nodemailer
 */
import { createManager } from '../src/index.js';
import { createSMTPTransport } from '../src/transports/smtp.js';

// In a real application, import nodemailer:
// import nodemailer from 'nodemailer';

async function main() {
  // Create a nodemailer transporter
  // const transporter = nodemailer.createTransport({
  //   host: 'smtp.example.com',
  //   port: 587,
  //   secure: false,
  //   auth: {
  //     user: 'your-email@example.com',
  //     pass: 'your-password',
  //   },
  // });

  // For this example, we'll use a mock transporter
  const mockTransporter = {
    async sendMail(options: { to: string | string[]; subject: string; text?: string }) {
      console.log('📧 Email sent:');
      console.log('   To:', options.to);
      console.log('   Subject:', options.subject);
      console.log('   Body:', options.text);
      return { messageId: 'mock-id' };
    },
  };

  const manager = createManager();

  // Register SMTP transport
  manager.use(
    createSMTPTransport({
      transporter: mockTransporter,
      from: 'appointments@example.com',
      events: ['appointment.confirmed', 'appointment.cancelled', 'appointment.rescheduled'],
      template: (event) => {
        const email = event.appointment.metadata?.email as string | undefined;
        if (!email) {
          return { to: '', subject: '', text: '' }; // Skip if no email
        }

        const status = event.type.split('.')[1];
        return {
          to: email,
          subject: `Appointment ${status}: ${event.appointment.title}`,
          text: [
            `Hello,`,
            ``,
            `Your appointment "${event.appointment.title}" has been ${status}.`,
            ``,
            `Details:`,
            `  Start: ${event.appointment.startsAt}`,
            `  End: ${event.appointment.endsAt}`,
            event.previous
              ? `  (Previously scheduled for: ${event.previous.startsAt})`
              : '',
            ``,
            `Thank you.`,
          ]
            .filter(Boolean)
            .join('\n'),
        };
      },
    })
  );

  // Create an appointment with email metadata
  const appointment = await manager.createAppointment({
    title: 'Consultation',
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    metadata: {
      email: 'client@example.com',
      phone: '+1234567890',
    },
  });

  console.log('\n--- Confirming appointment ---');
  await manager.confirmAppointment(appointment.id);

  console.log('\n--- Rescheduling appointment ---');
  await manager.rescheduleAppointment({
    id: appointment.id,
    startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000 + 60 * 60 * 1000),
  });

  console.log('\n--- Cancelling appointment ---');
  await manager.cancelAppointment(appointment.id);

  manager.close();
}

main().catch(console.error);
