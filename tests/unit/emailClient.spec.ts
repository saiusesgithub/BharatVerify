import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const originalEnv = { ...process.env };

function restoreEnv() {
  Object.keys(process.env).forEach((key) => {
    if (!(key in originalEnv)) delete process.env[key];
  });
  Object.assign(process.env, originalEnv);
}

describe('email client transport selection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('returns Gmail transport when configured', async () => {
    process.env.EMAIL_TRANSPORT = 'gmail';
    process.env.EMAIL_HOST_USER = 'user@example.com';
    process.env.EMAIL_HOST_PASSWORD = 'app-password';
    const { getEmailClient, resetEmailClientForTests } = await import('../../src/notifications/email/email_client');
    resetEmailClientForTests();
    const client = getEmailClient();
    expect(client.constructor.name).toBe('GmailEmailClient');
    expect(client.configured).toBe(true);
  }, 10000);

  it('returns SendGrid transport when API key present', async () => {
    process.env.EMAIL_TRANSPORT = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'SG.xxx';
    const { getEmailClient, resetEmailClientForTests } = await import('../../src/notifications/email/email_client');
    resetEmailClientForTests();
    const client = getEmailClient();
    expect(client.constructor.name).toBe('SendGridEmailClient');
    expect(client.configured).toBe(true);
  }, 10000);

  it('returns Mailgun transport when domain and API key provided', async () => {
    process.env.EMAIL_TRANSPORT = 'mailgun';
    process.env.MAILGUN_API_KEY = 'key-123';
    process.env.MAILGUN_DOMAIN = 'mg.example.com';
    const { getEmailClient, resetEmailClientForTests } = await import('../../src/notifications/email/email_client');
    resetEmailClientForTests();
    const client = getEmailClient();
    expect(client.constructor.name).toBe('MailgunEmailClient');
    expect(client.configured).toBe(true);
  }, 10000);

  it('returns SES transport when credentials provided', async () => {
    process.env.EMAIL_TRANSPORT = 'ses';
    process.env.SES_ACCESS_KEY_ID = 'AKIA123';
    process.env.SES_SECRET_ACCESS_KEY = 'secret';
    process.env.SES_REGION = 'ap-south-1';
    const { getEmailClient, resetEmailClientForTests } = await import('../../src/notifications/email/email_client');
    resetEmailClientForTests();
    const client = getEmailClient();
    expect(client.constructor.name).toBe('SesEmailClient');
    expect(client.configured).toBe(true);
  }, 10000);

  it('falls back to noop client when missing config', async () => {
    process.env.EMAIL_TRANSPORT = 'gmail';
    process.env.EMAIL_HOST_USER = '';
    process.env.EMAIL_HOST_PASSWORD = '';
    const { getEmailClient, resetEmailClientForTests } = await import('../../src/notifications/email/email_client');
    resetEmailClientForTests();
    const client = getEmailClient();
    expect(client.constructor.name).toBe('NoopEmailClient');
    expect(client.configured).toBe(false);
  }, 10000);
});
