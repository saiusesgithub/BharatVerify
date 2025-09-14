export type Role = 'ADMIN' | 'VERIFIER';

export interface Certificate {
  id: string; // docId
  issuerId: string;
  fileUrl: string;
  hash: string;
  signature: string; // base64
  issuedAt: Date;
  meta: unknown;
}

export interface VerificationResult {
  docId: string;
  status: 'PASS' | 'FAIL';
  reasons: string[];
  checkedAt: Date;
}

