import { PrismaClient } from '@prisma/client';

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  async listForUser(userId: string, limit = 20, offset = 0) {
    const items = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
    return items;
  }
}

