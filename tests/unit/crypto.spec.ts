import { describe, it, expect } from 'vitest';
import { sha256, verifyEd25519, signEd25519 } from '../../src/utils/crypto';
import crypto from 'crypto';

describe('crypto utils', () => {
  it('sha256 hashes known input', () => {
    const hex = sha256(Buffer.from('hello'));
    expect(hex).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('ed25519 sign/verify works on hash bytes', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const msg = Buffer.from(sha256(Buffer.from('abc')), 'hex');
    const sig = signEd25519(priv, msg);
    expect(verifyEd25519(pub, msg, sig)).toBe(true);
  });
});

