import { PrismaClient } from '@prisma/client';
import { CloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { BlockchainAdapter } from '../adapters/blockchainAdapter';
import { sha256, signEd25519 } from '../utils/crypto';
import crypto from 'crypto';

export class CertificateService {
  constructor(
    private prisma: PrismaClient,
    private storage: CloudStorageAdapter,
    private chain: BlockchainAdapter
  ) {}

  async uploadCertificate(params: {
    issuerUserId: string;
    meta: any;
    fileBuffer: Buffer;
    originalName: string;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: params.issuerUserId }, include: { issuer: true } });
    if (!user || !user.issuer) throw new Error('Issuer not found for user');

    const hashHex = sha256(params.fileBuffer);
    const signature = signEd25519(user.issuer.privateKeyPem, Buffer.from(hashHex, 'hex'));

    const fileUrl = await this.storage.upload(params.fileBuffer, params.originalName);
    const docId = crypto.randomUUID();

    const cert = await this.prisma.certificate.create({
      data: {
        id: docId,
        issuerId: user.issuer.id,
        fileUrl,
        hash: hashHex,
        signature: signature.toString('base64'),
        meta: params.meta
      }
    });

    await this.chain.recordCertificate({
      docId,
      issuerId: user.issuer.id,
      hash: hashHex,
      signature: signature.toString('base64')
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'UPLOAD',
        userId: user.id,
        role: user.role,
        refType: 'Certificate',
        refId: docId,
        details: { fileUrl }
      }
    });

    return cert;
  }
}

