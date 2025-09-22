import { config } from '../../config/secrets';
import { sendEmail } from './email_client';
import {
  buildIssueSuccessTemplate,
  buildVerificationResultTemplate,
  buildVerificationFailedTemplate,
  buildRevokedTemplate,
  IssueSuccessTemplateInput,
  VerificationResultTemplateInput,
  VerificationFailedTemplateInput,
  RevokedTemplateInput
} from './email_templates';

const defaultFromName = config.email.fromName || config.email.appName;

function uniqueEmails(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  values
    .filter((value): value is string => Boolean(value && value.includes('@')))
    .forEach((value) => set.add(value.trim()));
  return Array.from(set);
}

async function deliver(to: string[], template: { subject: string; text: string; html: string }) {
  if (to.length === 0) return;
  try {
    await sendEmail({
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
      fromName: defaultFromName
    });
  } catch (error) {
    console.warn('EMAIL_NOTIFY_FAILED', {
      to,
      subject: template.subject,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function issuerRecipients(preferred?: string | null): string[] {
  const emails = uniqueEmails([
    preferred || null,
    config.email.issuerFallbackEmail || null,
    config.email.adminEmail || null
  ]);
  if (emails.length === 0) {
    return uniqueEmails([config.email.adminEmail || null]);
  }
  return emails;
}

function adminRecipients(): string[] {
  return uniqueEmails([config.email.adminEmail || null]);
}

function studentRecipients(studentEmail?: string | null): string[] {
  if (!config.email.studentNotifEnabled) return [];
  return uniqueEmails([studentEmail || null]);
}

export interface NotifyIssueSuccessParams extends IssueSuccessTemplateInput {}

export async function notifyIssueSuccess(params: NotifyIssueSuccessParams): Promise<void> {
  const template = buildIssueSuccessTemplate(params);
  const recipients = issuerRecipients(params.issuerEmail);
  await deliver(recipients, template);
}

export interface NotifyVerificationResultParams extends VerificationResultTemplateInput {
  studentEmail?: string | null;
  issuerEmail?: string | null;
}

export async function notifyVerificationResult(params: NotifyVerificationResultParams): Promise<void> {
  const template = buildVerificationResultTemplate(params);
  const recipients = issuerRecipients(params.issuerEmail);
  await deliver(recipients, template);
  const studentList = studentRecipients(params.studentEmail);
  if (studentList.length > 0) {
    await deliver(studentList, template);
  }
}

export interface NotifyAdminVerificationFailedParams extends VerificationFailedTemplateInput {}

export async function notifyAdminVerificationFailed(params: NotifyAdminVerificationFailedParams): Promise<void> {
  const template = buildVerificationFailedTemplate(params);
  const recipients = adminRecipients();
  await deliver(recipients, template);
}

export interface NotifyRevokedParams extends RevokedTemplateInput {
  studentEmail?: string | null;
  issuerEmail?: string | null;
}

export async function notifyRevoked(params: NotifyRevokedParams): Promise<void> {
  const template = buildRevokedTemplate(params);
  const recipients = issuerRecipients(params.issuerEmail);
  await deliver(recipients, template);
  const studentList = studentRecipients(params.studentEmail);
  if (studentList.length > 0) {
    await deliver(studentList, template);
  }
}

export const emailService = {
  notifyIssueSuccess,
  notifyVerificationResult,
  notifyAdminVerificationFailed,
  notifyRevoked
};
