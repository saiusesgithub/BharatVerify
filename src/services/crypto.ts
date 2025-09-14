import crypto from 'crypto';
import { keccak256, toUtf8Bytes, getBytes, SigningKey, solidityPackedKeccak256 } from 'ethers';

export function sha256Bytes(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function keccak256Hex(input: string): string {
  if (input.startsWith('0x')) return keccak256(getBytes(input));
  return keccak256(toUtf8Bytes(input));
}

export function docKey(docId: string): string {
  return keccak256(toUtf8Bytes(docId));
}

export function buildSignatureMessage(docId: string, sha256Hex: string, issuedAtUnix: number): string {
  if (!/^[0-9a-f]{64}$/i.test(sha256Hex)) throw new Error('sha256Hex must be 64 hex chars');
  const dk = docKey(docId);
  const bytes32 = '0x' + sha256Hex.toLowerCase();
  return solidityPackedKeccak256(['bytes32', 'bytes32', 'uint64'], [dk, bytes32, BigInt(issuedAtUnix)]);
}

export function signMessageHash(hash0x: string, privateKey0x: string): string {
  const key = new SigningKey(privateKey0x);
  const sig = key.sign(hash0x);
  const v = sig.recoveryParam ?? 0;
  const r = sig.r, s = sig.s;
  // ethers returns r,s as 0x.. 32-byte each; compose 65 bytes r||s||v
  const rBytes = Buffer.from(r.slice(2), 'hex');
  const sBytes = Buffer.from(s.slice(2), 'hex');
  const vByte = Buffer.from([27 + v]);
  return '0x' + Buffer.concat([rBytes, sBytes, vByte]).toString('hex');
}
