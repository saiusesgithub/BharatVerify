import { config } from '../../config/secrets';

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface IssueSuccessTemplateInput {
  docId: string;
  title?: string | null;
  issuedAt: number;
  issuerEmail?: string | null;
  sha256Hex: string;
  txHash?: string | null;
  explorerUrl?: string | null;
}

export interface VerificationResultTemplateInput {
  docId: string;
  title?: string | null;
  company: string;
  result: 'pass' | 'fail' | 'revoked' | string;
  hashMatch: boolean;
  issuerVerified: boolean;
  whenUnix: number;
  expectedHash?: string | null;
  actualHash?: string | null;
}

export interface VerificationFailedTemplateInput {
  docId: string;
  reason: string;
  expectedHash?: string | null;
  actualHash?: string | null;
  whenUnix: number;
}

export interface RevokedTemplateInput {
  docId: string;
  title?: string | null;
  reason?: string | null;
  whenUnix: number;
}

function formatUnix(unix: number): string {
  if (!unix) return 'N/A';
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

function shortHex(value: string | null | undefined, length = 10): string {
  if (!value) return 'n/a';
  if (value.length <= length) return value;
  return `${value.slice(0, Math.floor((length - 1) / 2))}…${value.slice(-Math.floor((length - 1) / 2))}`;
}

function safe(value: string | null | undefined, fallback = 'n/a'): string {
  if (!value || value.trim().length === 0) return fallback;
  return value;
}

function renderText(intro: string[], rows: Array<[string, string]>, outro: string[]): string {
  const body = rows.map(([label, val]) => `${label}: ${val}`);
  return [...intro, '', ...body, '', ...outro].filter((line) => line !== undefined).join('\n');
}

function renderHtml(title: string, intro: string[], rows: Array<[string, string]>, outro: string[]): string {
  const rowHtml = rows
    .map(
      ([label, val]) =>
        `<tr><td style="padding:4px 0;font-weight:600;color:#111827;">${label}</td><td style="padding:4px 0;color:#111827;">${val}</td></tr>`
    )
    .join('');
  const introHtml = intro.map((line) => `<p style="margin:0 0 12px 0;color:#111827;">${line}</p>`).join('');
  const outroHtml = outro.map((line) => `<p style="margin:12px 0 0 0;color:#111827;">${line}</p>`).join('');
  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;background-color:#f3f4f6;padding:24px;">
    <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <h2 style="margin-top:0;color:#111827;font-size:20px;">${title}</h2>
      ${introHtml}
      <table style="width:100%;border-collapse:collapse;">${rowHtml}</table>
      ${outroHtml}
      <p style="margin-top:24px;color:#6b7280;font-size:12px;">${config.email.appName} • ${config.email.appBaseUrl}</p>
    </div>
  </body></html>`;
}

export function buildIssueSuccessTemplate(input: IssueSuccessTemplateInput): EmailTemplate {
  const subject = `? [${config.email.appName}] Certificate Anchored — ${input.docId}`;
  const issuedAt = formatUnix(input.issuedAt);
  const explorer = input.explorerUrl || `${config.email.appBaseUrl.replace(/\/$/, '')}/certs/${input.docId}`;
  const intro = [
    'Hello,',
    `The certificate "${safe(input.title, 'Untitled Document')}" has been anchored on-chain successfully.`,
    'Below are the key details:'
  ];
  const rows: Array<[string, string]> = [
    ['Document ID', input.docId],
    ['Issued At', issuedAt],
    ['SHA-256 (short)', shortHex(input.sha256Hex)],
    ['Transaction Hash', shortHex(input.txHash)],
    ['Explorer', `<a href="${explorer}">${explorer}</a>`]
  ];
  const rowsText: Array<[string, string]> = [
    ['Document ID', input.docId],
    ['Issued At', issuedAt],
    ['SHA-256', shortHex(input.sha256Hex)],
    ['Transaction Hash', shortHex(input.txHash)],
    ['Explorer', explorer]
  ];
  const outro = ['If this action looks unfamiliar, please reach out to the BharatVerify admin team immediately.'];
  return {
    subject,
    text: renderText(intro, rowsText, outro),
    html: renderHtml('Certificate Anchored', intro, rows, outro)
  };
}

export function buildVerificationResultTemplate(input: VerificationResultTemplateInput): EmailTemplate {
  const resultLabel = input.result.toUpperCase();
  const subject = `?? [${config.email.appName}] Verification ${resultLabel} — ${input.docId}`;
  const verifiedWord = input.hashMatch ? 'matches' : 'does NOT match';
  const intro = [
    `Verification requested by ${safe(input.company, 'Unknown Company')} completed with status ${resultLabel}.`,
    `Submitted artifact ${verifiedWord} the anchored hash.`
  ];
  if (!input.hashMatch) {
    intro.push('Please review the mismatch and contact the issuer if needed.');
  }
  const rows: Array<[string, string]> = [
    ['Document ID', input.docId],
    ['Title', safe(input.title, 'Untitled')],
    ['Checked At', formatUnix(input.whenUnix)],
    ['Hash Match', input.hashMatch ? 'Yes' : 'No'],
    ['Issuer Verified', input.issuerVerified ? 'Yes' : 'No']
  ];
  const rowsText = rows.map(([label, val]) => [label, val] as [string, string]);
  if (input.expectedHash) {
    rows.push(['Expected Hash', `<code>${input.expectedHash}</code>`]);
    rowsText.push(['Expected Hash', input.expectedHash]);
  }
  if (input.actualHash) {
    rows.push(['Provided Hash', `<code>${input.actualHash}</code>`]);
    rowsText.push(['Provided Hash', input.actualHash]);
  }
  const outro =
    input.result.toLowerCase() === 'fail'
      ? [
          'Next steps:',
          '• Ask the issuer to re-upload the official certificate PDF.',
          '• Check the on-chain transaction on the explorer link for history.',
          '• Contact the BharatVerify team if the issue persists.'
        ]
      : ['Keep this email for your records. No further action is required.'];
  return {
    subject,
    text: renderText(intro, rowsText, outro),
    html: renderHtml('Certificate Verification Result', intro, rows, outro)
  };
}

export function buildVerificationFailedTemplate(input: VerificationFailedTemplateInput): EmailTemplate {
  const subject = `?? [${config.email.appName}] Verification Failure — ${input.docId}`;
  const intro = [
    'An automated verification attempt failed before completion.',
    `Reason: ${input.reason}`
  ];
  const rows: Array<[string, string]> = [
    ['Document ID', input.docId],
    ['Checked At', formatUnix(input.whenUnix)]
  ];
  const rowsText = rows.map(([label, val]) => [label, val] as [string, string]);
  if (input.expectedHash) {
    rows.push(['Expected Hash', `<code>${input.expectedHash}</code>`]);
    rowsText.push(['Expected Hash', input.expectedHash]);
  }
  if (input.actualHash) {
    rows.push(['Actual Hash', `<code>${input.actualHash}</code>`]);
    rowsText.push(['Actual Hash', input.actualHash]);
  }
  const outro = ['Please review the adapter logs and connection status, then retry the verification.'];
  return {
    subject,
    text: renderText(intro, rowsText, outro),
    html: renderHtml('Automated Verification Failure', intro, rows, outro)
  };
}

export function buildRevokedTemplate(input: RevokedTemplateInput): EmailTemplate {
  const subject = `? [${config.email.appName}] Certificate Revoked — ${input.docId}`;
  const intro = [
    `The certificate "${safe(input.title, 'Untitled Document')}" has been revoked on BharatVerify.`,
    'It is no longer considered valid.'
  ];
  const rows: Array<[string, string]> = [
    ['Document ID', input.docId],
    ['Revoked At', formatUnix(input.whenUnix)],
    ['Reason', safe(input.reason, 'No reason provided')]
  ];
  const rowsText = rows.map(([label, val]) => [label, val] as [string, string]);
  const outro = ['If this revocation was unexpected, please coordinate with the issuing authority.'];
  return {
    subject,
    text: renderText(intro, rowsText, outro),
    html: renderHtml('Certificate Revoked', intro, rows, outro)
  };
}
