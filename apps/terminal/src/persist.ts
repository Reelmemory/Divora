import { Prisma, PrismaClient } from "@prisma/client";
import type { ListingSnapshot, ListingStore } from "@divora/market";

export function createPrismaListingStore(prisma = new PrismaClient()): ListingStore {
  return {
    async upsertSnapshots(rows: ListingSnapshot[]) {
      for (const row of rows) {
        const payload = row.payload as Prisma.InputJsonValue;
        await prisma.marketListingSnapshot.upsert({
          where: { id: row.id },
          create: { ...row, payload },
          update: { price: row.price, seller: row.seller, freshness: row.freshness, observedAt: row.observedAt, payload },
        });
      }
      return { persisted: rows.length };
    },
  };
}