import { PrismaClient } from '@prisma/client';
import { CloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { BlockchainAdapter } from '../adapters/blockchainAdapter';
import crypto from 'crypto';
import { sha256Bytes, buildSignatureMessage, signMessageHash } from './crypto';
import { chainAdapter } from './chainAdapter';
import { config } from '../config/secrets';

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
    title?: string;
    docId?: string;
    reason?: string;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: params.issuerUserId }, include: { issuer: true } });
    if (!user || !user.issuer) throw new Error('Issuer not found for user');

    // Note: QR/metadata stamping is out-of-scope here; hash the provided PDF bytes.
    const issuedAtUnix = Math.floor(Date.now() / 1000);
    const sha256Hex = sha256Bytes(params.fileBuffer);
    const fileUrl = await this.storage.upload(params.fileBuffer, params.originalName);
    const docId = params.docId || crypto.randomUUID();

    const cert = await this.prisma.certificate.create({
      data: {
        id: docId,
        issuerId: user.issuer.id,
        fileUrl,
        hash: sha256Hex,
        signature: '',
        meta: JSON.stringify(params.meta || {}),
        title: params.title || null,
        issuedAtUnix,
        sha256Hex,
        issuerAddress: config.issuerAddress || null,
        signatureHex: null,
        status: 'active',
        reason: params.reason || 'initial-issue',
        r2Key: fileUrl,
        txHash: null,
        blockNumber: null,
        chain: null,
        explorerUrl: null
      }
    });

    // Optional ECDSA signing
    if (config.issuerPrivKeyHex) {
      const msgHash = buildSignatureMessage(docId, sha256Hex, issuedAtUnix);
      const signatureHex = signMessageHash(msgHash, config.issuerPrivKeyHex);
      await this.prisma.certificate.update({ where: { id: docId }, data: { signatureHex } });
    }

    // Anchor on chain via adapter
    const tx = await chainAdapter.anchor({ docId, sha256Hex, reason: params.reason || 'initial-issue' });
    await this.prisma.certificate.update({ where: { id: docId }, data: { txHash: tx.txHash, blockNumber: tx.blockNumber, chain: tx.chain, explorerUrl: tx.explorerUrl } });

    await this.prisma.auditLog.create({
      data: {
        action: 'UPLOAD',
        userId: user.id,
        role: user.role,
        refType: 'Certificate',
        refId: docId,
        details: JSON.stringify({ fileUrl, sha256Hex })
      }
    });

    return await this.prisma.certificate.findUnique({ where: { id: docId } });
  }
}
