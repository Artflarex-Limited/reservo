import type { AppointmentEvent, AppointmentEventType, TransportAdapter } from '../types.js';

/**
 * Email template function signature.
 */
export type EmailTemplate = (event: AppointmentEvent) => EmailMessage;

/**
 * Email message structure.
 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

/**
 * SMTP transport options.
 */
export interface SMTPTransportOptions {
  /**
   * Nodemailer transporter instance.
   * Create with nodemailer.createTransport()
   */
  transporter: NodemailerTransporter;
  /**
   * Function to generate email content from an event.
   * Required - you must define how emails are formatted.
   */
  template: EmailTemplate;
  /**
   * Default "from" address if not specified in template.
   */
  from?: string;
  /**
   * Which events to send emails for.
   * Defaults to all events.
   */
  events?: AppointmentEventType[];
}

/**
 * Minimal nodemailer transporter interface.
 * We only require sendMail to avoid hard dependency.
 */
export interface NodemailerTransporter {
  sendMail(options: {
    from?: string | undefined;
    to: string | string[];
    subject: string;
    text?: string | undefined;
    html?: string | undefined;
  }): Promise<unknown>;
}

/**
 * SMTP transport adapter.
 * Sends emails via nodemailer when appointment events occur.
 *
 * @example
 * ```typescript
 * import nodemailer from 'nodemailer';
 * import { createSMTPTransport } from 'reservo/transports/smtp';
 *
 * const transporter = nodemailer.createTransport({ ... });
 *
 * const smtp = createSMTPTransport({
 *   transporter,
 *   from: 'noreply@example.com',
 *   template: (event) => ({
 *     to: event.appointment.metadata?.email as string,
 *     subject: `Appointment ${event.type.split('.')[1]}`,
 *     text: `Your appointment "${event.appointment.title}" has been ${event.type.split('.')[1]}.`
 *   })
 * });
 * ```
 */
export function createSMTPTransport(options: SMTPTransportOptions): TransportAdapter {
  const { transporter, template, from, events } = options;

  return {
    name: 'smtp',
    events,

    async handle(event: AppointmentEvent): Promise<void> {
      const message = template(event);

      if (!message.to) {
        return;
      }

      await transporter.sendMail({
        from: message.from ?? from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
