import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createSMTPTransport } from './smtp.js';
import type { AppointmentEvent } from '../types.js';
import type { NodemailerTransporter } from './smtp.js';

function makeEvent(overrides: Partial<AppointmentEvent> = {}): AppointmentEvent {
  const now = new Date().toISOString();
  return {
    type: 'appointment.created',
    appointment: {
      id: 'test-id',
      title: 'Test',
      startsAt: '2024-01-15T10:00:00.000Z',
      endsAt: '2024-01-15T11:00:00.000Z',
      status: 'created',
      createdAt: now,
      updatedAt: now,
    },
    timestamp: now,
    ...overrides,
  };
}

function mockTransporter() {
  const sent: unknown[] = [];
  const transporter: NodemailerTransporter = {
    async sendMail(options) {
      sent.push(options);
      return { messageId: 'mock-id' };
    },
  };
  return { sent, transporter };
}

describe('createSMTPTransport', () => {
  it('sends mail using template output', async () => {
    const { sent, transporter } = mockTransporter();
    const transport = createSMTPTransport({
      transporter,
      from: 'noreply@example.com',
      template: () => ({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'body',
      }),
    });

    assert.strictEqual(transport.name, 'smtp');
    await transport.handle(makeEvent());

    assert.strictEqual(sent.length, 1);
    assert.deepStrictEqual(sent[0], {
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Hello',
      text: 'body',
      html: undefined,
    });
  });

  it('prefers message from over default from', async () => {
    const { sent, transporter } = mockTransporter();
    const transport = createSMTPTransport({
      transporter,
      from: 'default@example.com',
      template: () => ({
        to: 'user@example.com',
        subject: 'Hi',
        from: 'custom@example.com',
      }),
    });

    await transport.handle(makeEvent());
    assert.strictEqual((sent[0] as { from: string }).from, 'custom@example.com');
  });

  it('sends html when provided', async () => {
    const { sent, transporter } = mockTransporter();
    const transport = createSMTPTransport({
      transporter,
      template: () => ({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Hi',
        html: '<b>Hi</b>',
      }),
    });

    await transport.handle(makeEvent());
    assert.deepStrictEqual((sent[0] as { to: string[] }).to, [
      'a@example.com',
      'b@example.com',
    ]);
    assert.strictEqual((sent[0] as { html: string }).html, '<b>Hi</b>');
  });

  it('skips sending when template has no recipient', async () => {
    const { sent, transporter } = mockTransporter();
    const transport = createSMTPTransport({
      transporter,
      from: 'noreply@example.com',
      template: () => ({
        // @ts-expect-error testing empty recipient guard
        to: undefined,
        subject: 'No one',
      }),
    });

    await transport.handle(makeEvent());
    assert.strictEqual(sent.length, 0);
  });

  it('exposes configured events filter', () => {
    const { transporter } = mockTransporter();
    const transport = createSMTPTransport({
      transporter,
      template: () => ({ to: 'u@e.com', subject: 's' }),
      events: ['appointment.confirmed'],
    });
    assert.deepStrictEqual(transport.events, ['appointment.confirmed']);
  });

  it('leaves events undefined when not configured', () => {
    const { transporter } = mockTransporter();
    const transport = createSMTPTransport({
      transporter,
      template: () => ({ to: 'u@e.com', subject: 's' }),
    });
    assert.strictEqual(transport.events, undefined);
  });

  it('propagates template errors to the caller', async () => {
    const { transporter } = mockTransporter();
    const transport = createSMTPTransport({
      transporter,
      template: () => {
        throw new Error('template boom');
      },
    });
    await assert.rejects(transport.handle(makeEvent()), /template boom/);
  });

  it('propagates transporter errors to the caller', async () => {
    const failing: NodemailerTransporter = {
      async sendMail() {
        throw new Error('smtp down');
      },
    };
    const transport = createSMTPTransport({
      transporter: failing,
      template: () => ({ to: 'u@e.com', subject: 's' }),
    });
    await assert.rejects(transport.handle(makeEvent()), /smtp down/);
  });
});
