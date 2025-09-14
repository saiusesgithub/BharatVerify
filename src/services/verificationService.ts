import { PrismaClient } from '@prisma/client';
import { CloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { BlockchainAdapter } from '../adapters/blockchainAdapter';
import { KeyRegistry } from '../adapters/keyRegistry';
import { sha256, verifyEd25519 } from '../utils/crypto';

export class VerificationService {
  constructor(
    private prisma: PrismaClient,
    private storage: CloudStorageAdapter,
    private chain: BlockchainAdapter,
    private keys: KeyRegistry
  ) {}

  async verify(params: { verifierUserId: string; docId: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: params.verifierUserId } });
    if (!user) throw new Error('User not found');

    const cert = await this.prisma.certificate.findUnique({ where: { id: params.docId } });
    if (!cert) {
      await this.prisma.verificationResult.create({
        data: { docId: params.docId, status: 'FAIL', reasons: JSON.stringify(['CERT_NOT_FOUND']), verifierUserId: user.id }
      });
      return { status: 'FAIL', reasons: ['CERT_NOT_FOUND'] as string[] };
    }

    const reasons: string[] = [];
    // Download and hash
    const bytes = await this.storage.download(cert.fileUrl);
    const hashHex = sha256(bytes);
    if (hashHex !== cert.hash) reasons.push('HASH_MISMATCH');

    // Verify signature using issuer public key
    const pub = await keysOrDb(this.keys, this.prisma, cert.issuerId);
    const sigOk = verifyEd25519(pub, Buffer.from(cert.hash, 'hex'), Buffer.from(cert.signature, 'base64'));
    if (!sigOk) reasons.push('SIG_INVALID');

    // Chain record
    const chainRec = await this.chain.getCertificateRecord(cert.id);
    if (!chainRec) {
      reasons.push('CHAIN_MISS');
    } else {
      if (chainRec.hash !== cert.hash) reasons.push('HASH_MISMATCH');
      if (chainRec.signature !== cert.signature) reasons.push('SIG_INVALID');
    }

    const status = reasons.length === 0 ? 'PASS' : 'FAIL';
    await this.prisma.verificationResult.create({
      data: { docId: cert.id, status: status as any, reasons: JSON.stringify(reasons), verifierUserId: user.id }
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'VERIFY',
        userId: user.id,
        role: user.role,
        refType: 'Certificate',
        refId: cert.id,
        details: { status, reasons }
      }
    });

    return { status, reasons };
  }
}

async function keysOrDb(keys: KeyRegistry, prisma: PrismaClient, issuerId: string): Promise<string> {
  try {
    return await keys.getPublicKeyForIssuer(issuerId);
  } catch {
    const issuer = await prisma.issuer.findUnique({ where: { id: issuerId } });
    if (!issuer) throw new Error('Issuer not found');
    return issuer.publicKeyPem;
  }
}

