import { PrismaClient } from '@prisma/client';

export interface ChainRecordData {
  docId: string;
  issuerId: string;
  hash: string;
  signature: string; // base64
}

export interface BlockchainAdapter {
  recordCertificate: (meta: ChainRecordData) => Promise<void>;
  getCertificateRecord: (docId: string) => Promise<ChainRecordData | null>;
}

export function createMockBlockchainAdapter(prisma: PrismaClient): BlockchainAdapter {
  return {
    async recordCertificate(meta: ChainRecordData) {
      await prisma.chainRecord.upsert({
        where: { docId: meta.docId },
        create: { docId: meta.docId, data: meta },
        update: { data: meta }
      });
      // Log payload without secrets
      console.log('[MockChain] recorded', { docId: meta.docId, issuerId: meta.issuerId });
    },
    async getCertificateRecord(docId: string) {
      const rec = await prisma.chainRecord.findUnique({ where: { docId } });
      return rec ? (rec.data as ChainRecordData) : null;
    }
  };
}

