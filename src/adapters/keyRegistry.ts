import { PrismaClient } from '@prisma/client';

export interface KeyRegistry {
  getPublicKeyForIssuer: (issuerId: string) => Promise<string>;
}

export function createKeyRegistry(prisma: PrismaClient): KeyRegistry {
  return {
    async getPublicKeyForIssuer(issuerId: string): Promise<string> {
      const issuer = await prisma.issuer.findUnique({ where: { id: issuerId } });
      if (!issuer) throw new Error('Issuer not found');
      return issuer.publicKeyPem;
    }
  };
}

