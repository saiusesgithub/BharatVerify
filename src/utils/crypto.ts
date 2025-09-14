import crypto from 'crypto';

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function signEd25519(privateKeyPem: string, data: Buffer): Buffer {
  const key = crypto.createPrivateKey(privateKeyPem);
  return crypto.sign(null, data, key);
}

export function verifyEd25519(publicKeyPem: string, data: Buffer, signature: Buffer): boolean {
  const key = crypto.createPublicKey(publicKeyPem);
  return crypto.verify(null, data, key, signature);
}

