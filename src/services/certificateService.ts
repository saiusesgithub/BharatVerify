import { PrismaClient } from '@prisma/client';
import { CloudStorageAdapter } from '../adapters/cloudStorageAdapter';
import { BlockchainAdapter } from '../adapters/blockchainAdapter';
import crypto from 'crypto';
import { sha256Bytes, buildSignatureMessage, signMessageHash } from './crypto';
import { chainAdapter } from './chainAdapter';
import { config } from '../config/secrets';
import { generateQrPngBytes, stampQr, addMetadata } from './pdf';
import { AppError, ErrorCodes } from '../utils/errors';

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
    studentId?: string;
    studentEmail?: string;
    studentName?: string;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: params.issuerUserId }, include: { issuer: true } });
    if (!user || !user.issuer) throw new Error('Issuer not found for user');

    const issuedAtUnix = Math.floor(Date.now() / 1000);
    const docId = params.docId || crypto.randomUUID();
    const qrText = `${process.env.QR_BASE_URL || 'https://example.invalid/cert/'}${docId}`;
    const qr = await generateQrPngBytes(qrText);
    const stamped = await stampQr(params.fileBuffer, qr, 'bottom-right');
    const withMeta = await addMetadata(stamped, { DocId: docId, IssuedAt: String(issuedAtUnix), IssuerAddr: config.issuerAddress || undefined });
    const sha256Hex = sha256Bytes(withMeta);
    const fileUrl = await this.storage.upload(withMeta, params.originalName);

    const metaPayload: Record<string, any> = { ...(params.meta || {}) };

    let studentRecord: { id: string; email: string | null; name: string | null } | null = null;
    const metaStudentId = typeof metaPayload.studentId === 'string' ? String(metaPayload.studentId).trim() : undefined;
    const payloadStudentId = typeof params.studentId === 'string' ? params.studentId.trim() : undefined;
    const studentEmail = typeof params.studentEmail === 'string' ? params.studentEmail.trim() : (typeof metaPayload.studentEmail === 'string' ? String(metaPayload.studentEmail).trim() : undefined);

    if (payloadStudentId) {
      const student = await this.prisma.student.findUnique({ where: { id: payloadStudentId } });
      if (!student) throw new AppError(ErrorCodes.STUDENT_NOT_FOUND, `Student ${payloadStudentId} not found`, 404);
      studentRecord = { id: student.id, email: student.email, name: student.name || null };
    } else if (metaStudentId) {
      const student = await this.prisma.student.findUnique({ where: { id: metaStudentId } });
      if (!student) throw new AppError(ErrorCodes.STUDENT_NOT_FOUND, `Student ${metaStudentId} not found`, 404);
      studentRecord = { id: student.id, email: student.email, name: student.name || null };
    } else if (studentEmail) {
      const student = await this.prisma.student.findUnique({ where: { email: studentEmail } });
      if (!student) throw new AppError(ErrorCodes.STUDENT_NOT_FOUND, `Student with email ${studentEmail} not found`, 404);
      studentRecord = { id: student.id, email: student.email, name: student.name || null };
    }

    if (!studentRecord) {
      throw new AppError(ErrorCodes.STUDENT_NOT_FOUND, 'Student identifier is required for issuance', 400);
    }

    metaPayload.studentId = studentRecord.id;
    if (studentRecord.email) metaPayload.studentEmail = studentRecord.email;
    if (params.studentName) metaPayload.studentName = params.studentName;

    const cert = await this.prisma.certificate.create({
      data: {
        id: docId,
        issuerId: user.issuer.id,
        studentId: studentRecord.id,
        ownerId: studentRecord.id,
        fileUrl,
        hash: sha256Hex,
        signature: '',
        meta: JSON.stringify(metaPayload),
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
        details: JSON.stringify({ fileUrl, sha256Hex, studentId: studentRecord.id })
      }
    });

    return await this.prisma.certificate.findUnique({ where: { id: docId } });
  }
}
