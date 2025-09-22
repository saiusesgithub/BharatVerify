import { describe, it, expect } from 'vitest';
import {
  buildIssueSuccessTemplate,
  buildVerificationResultTemplate,
  buildVerificationFailedTemplate,
  buildRevokedTemplate
} from '../../src/notifications/email/email_templates';

describe('email templates', () => {
  it('builds issue success template with key fields', () => {
    const template = buildIssueSuccessTemplate({
      docId: 'CERT-123',
      title: 'B.Tech Degree',
      issuedAt: 1710000000,
      sha256Hex: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      txHash: '0x1234567890abcdef',
      explorerUrl: 'https://explorer.example/tx/0x123',
      issuerEmail: 'issuer@example.com'
    });
    expect(template.subject).toContain('CERT-123');
    expect(template.text).toContain('B.Tech Degree');
    expect(template.html).toContain('<table');
    expect(template.text).toContain('SHA-256');
    expect(template.html).toContain('explorer');
  });

  it('builds verification result template indicating failures', () => {
    const template = buildVerificationResultTemplate({
      docId: 'CERT-456',
      title: 'MSc Transcript',
      company: 'Verifier Org',
      result: 'fail',
      hashMatch: false,
      issuerVerified: false,
      whenUnix: 1710001234,
      expectedHash: 'EXPECTEDHASH',
      actualHash: 'ACTUALHASH'
    });
    expect(template.subject).toContain('FAIL');
    expect(template.text).toContain('Expected Hash');
    expect(template.text).toContain('Provided Hash');
    expect(template.html).toContain('Verifier Org');
  });

  it('builds admin failure template with reason', () => {
    const template = buildVerificationFailedTemplate({
      docId: 'CERT-789',
      reason: 'adapter down',
      expectedHash: 'AAA',
      actualHash: 'BBB',
      whenUnix: 1710002222
    });
    expect(template.subject).toContain('Failure');
    expect(template.text).toContain('adapter down');
    expect(template.html).toContain('adapter down');
  });

  it('builds revocation template', () => {
    const template = buildRevokedTemplate({
      docId: 'CERT-999',
      title: 'Diploma',
      reason: 'fraudulent',
      whenUnix: 1710003333
    });
    expect(template.subject).toContain('Revoked');
    expect(template.text).toContain('fraudulent');
    expect(template.html).toContain('Diploma');
  });
});
