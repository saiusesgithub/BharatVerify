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
        create: { docId: meta.docId, data: JSON.stringify(meta) },
        update: { data: JSON.stringify(meta) }
      });
      // Log payload without secrets
      console.log('[MockChain] recorded', { docId: meta.docId, issuerId: meta.issuerId });
    },
    async getCertificateRecord(docId: string) {
      const rec = await prisma.chainRecord.findUnique({ where: { docId } });
      if (!rec) return null;
      try {
        return JSON.parse(rec.data as unknown as string) as ChainRecordData;
      } catch {
        return null;
      }
    }
  };
}
