import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config, isEmailConfigured } from '../../config/secrets';

export type EmailAddress = string | string[];

export interface EmailSendParams {
  to: EmailAddress;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
  fromAddress?: string;
}

interface EmailClientImpl {
  configured: boolean;
  send(payload: EmailSendParams): Promise<void>;
}

const warnOnce = createOnceLogger('[email] Email not configured; notifications skipped');

function createOnceLogger(message: string) {
  let warned = false;
  return () => {
    if (!warned) {
      console.warn(message);
      warned = true;
    }
  };
}

function normalizeRecipients(to: EmailAddress): string[] {
  const arr = Array.isArray(to) ? to : [to];
  return arr.map((item) => item.trim()).filter((item) => item.length > 0);
}

function chooseFrom(payload: EmailSendParams, to: string[], extraFallback?: string): { address: string; name?: string } {
  const candidates = [
    payload.fromAddress,
    config.email.fromAddress,
    extraFallback,
    config.email.gmail.user,
    config.email.adminEmail,
    to[0],
    'no-reply@localhost'
  ].filter((value): value is string => Boolean(value && value.includes('@')));
  const address = candidates.length > 0 ? candidates[0] : 'no-reply@localhost';
  const name = payload.fromName || config.email.fromName || config.email.appName;
  return { address, name };
}

class NoopEmailClient implements EmailClientImpl {
  configured = false;
  async send(_payload: EmailSendParams): Promise<void> {
    warnOnce();
  }
}

class GmailEmailClient implements EmailClientImpl {
  configured: boolean;
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.configured = Boolean(config.email.gmail.user && config.email.gmail.password);
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: config.email.gmail.user,
          pass: config.email.gmail.password
        }
      });
    }
    return this.transporter;
  }

  async send(payload: EmailSendParams): Promise<void> {
    if (!this.configured) {
      warnOnce();
      return;
    }
    const transporter = this.getTransporter();
    const to = normalizeRecipients(payload.to);
    if (to.length === 0) return;
    const sender = payload.fromName || config.email.fromName || config.email.appName;
    const from = sender ? `${sender} <${config.email.gmail.user}>` : config.email.gmail.user;
    await transporter.sendMail({
      from,
      to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html
    });
  }
}

class SendGridEmailClient implements EmailClientImpl {
  configured: boolean;

  constructor() {
    this.configured = Boolean(config.email.sendgrid.apiKey);
    if (this.configured) {
      sgMail.setApiKey(config.email.sendgrid.apiKey);
    }
  }

  async send(payload: EmailSendParams): Promise<void> {
    if (!this.configured) {
      warnOnce();
      return;
    }
    const to = normalizeRecipients(payload.to);
    if (to.length === 0) return;
    const from = chooseFrom(payload, to);
    await sgMail.send({
      to,
      from: {
        email: from.address,
        name: from.name
      },
      subject: payload.subject,
      text: payload.text,
      html: payload.html
    });
  }
}

class MailgunEmailClient implements EmailClientImpl {
  configured: boolean;
  private client: any = null;

  constructor() {
    this.configured = Boolean(config.email.mailgun.apiKey && config.email.mailgun.domain);
    if (this.configured) {
      const mailgun = new Mailgun(FormData as any);
      this.client = mailgun.client({ username: 'api', key: config.email.mailgun.apiKey });
    }
  }

  async send(payload: EmailSendParams): Promise<void> {
    if (!this.configured || !this.client) {
      warnOnce();
      return;
    }
    const to = normalizeRecipients(payload.to);
    if (to.length === 0) return;
    const fallback = config.email.fromAddress || `notifications@${config.email.mailgun.domain}`;
    const from = chooseFrom(payload, to, fallback);
    await this.client.messages.create(config.email.mailgun.domain, {
      to,
      from: from.name ? `${from.name} <${from.address}>` : from.address,
      subject: payload.subject,
      text: payload.text,
      html: payload.html
    });
  }
}

class SesEmailClient implements EmailClientImpl {
  configured: boolean;
  private client: SESClient | null = null;

  constructor() {
    this.configured = Boolean(config.email.ses.accessKeyId && config.email.ses.secretAccessKey && config.email.ses.region);
    if (this.configured) {
      this.client = new SESClient({
        region: config.email.ses.region,
        credentials: {
          accessKeyId: config.email.ses.accessKeyId,
          secretAccessKey: config.email.ses.secretAccessKey
        }
      });
    }
  }

  async send(payload: EmailSendParams): Promise<void> {
    if (!this.configured || !this.client) {
      warnOnce();
      return;
    }
    const to = normalizeRecipients(payload.to);
    if (to.length === 0) return;
    const from = chooseFrom(payload, to);
    const command = new SendEmailCommand({
      Source: from.name ? `${from.name} <${from.address}>` : from.address,
      Destination: { ToAddresses: to },
      Message: {
        Subject: { Data: payload.subject },
        Body: {
          Text: { Data: payload.text },
          ...(payload.html ? { Html: { Data: payload.html } } : {})
        }
      }
    });
    await this.client.send(command);
  }
}

function createClient(): EmailClientImpl {
  if (!isEmailConfigured()) {
    return new NoopEmailClient();
  }
  switch (config.email.transport) {
    case 'gmail':
      return new GmailEmailClient();
    case 'sendgrid':
      return new SendGridEmailClient();
    case 'mailgun':
      return new MailgunEmailClient();
    case 'ses':
      return new SesEmailClient();
    default:
      return new NoopEmailClient();
  }
}

let cachedClient: EmailClientImpl | null = null;

export function getEmailClient(): EmailClientImpl {
  if (!cachedClient) cachedClient = createClient();
  return cachedClient;
}

export function resetEmailClientForTests() {
  cachedClient = null;
}

function shouldRetry(error: any): boolean {
  const status =
    (typeof error?.status === 'number' && error.status) ||
    (typeof error?.code === 'number' && error.code) ||
    (typeof error?.responseCode === 'number' && error.responseCode) ||
    (typeof error?.statusCode === 'number' && error.statusCode) ||
    (typeof error?.extensions?.response?.statusCode === 'number' && error.extensions.response.statusCode) ||
    (typeof error?.$metadata?.httpStatusCode === 'number' && error.$metadata.httpStatusCode);
  if (!status) return false;
  if (status >= 500) return true;
  if (status === 429) return true;
  return false;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function withRetry(operation: () => Promise<void>, payload: EmailSendParams): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        console.warn('EMAIL_SEND_FAILED', {
          transport: config.email.transport,
          to: normalizeRecipients(payload.to),
          subject: payload.subject,
          error: formatError(error)
        });
        throw error;
      }
      const delay = attempt * 300;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function sendEmail(payload: EmailSendParams): Promise<void> {
  const client = getEmailClient();
  if (!client.configured) {
    warnOnce();
    return;
  }
  const to = normalizeRecipients(payload.to);
  if (to.length === 0) return;
  await withRetry(() => client.send({ ...payload, to }), { ...payload, to });
}
