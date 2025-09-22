export const ErrorCodes = {
  AUTH_INVALID: 'AUTH_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  CERT_NOT_FOUND: 'CERT_NOT_FOUND',
  HASH_MISMATCH: 'HASH_MISMATCH',
  SIG_INVALID: 'SIG_INVALID',
  CHAIN_MISS: 'CHAIN_MISS',
  STUDENT_NOT_FOUND: 'STUDENT_NOT_FOUND',
  STUDENT_FORBIDDEN: 'STUDENT_FORBIDDEN'
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export class AppError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

