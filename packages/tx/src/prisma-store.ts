import { PrismaClient } from "@prisma/client";
import type { SimulationResult, StructuredTransactionRequest } from "@divora/shared";

export class PrismaTransactionStore {
  constructor(private prisma: PrismaClient) {}

  async saveIntent(intentId: string, data: {
    decisionId: string;
    opportunityId: string;
    chainId: number;
    contract: string;
    tokenId: string;
    marketplace: string;
    expectedPrice: string;
    maxPrice: string;
    estimatedGas: string;
    slippageBps: number;
    payload: StructuredTransactionRequest;
    expiresAt: Date;
  }) {
    return await this.prisma.transactionIntentRecord.upsert({
      where: { id: intentId },
      update: {
        expectedPrice: data.expectedPrice,
        maxPrice: data.maxPrice,
        estimatedGas: data.estimatedGas,
        slippageBps: data.slippageBps,
        payload: data.payload as any,
        expiresAt: data.expiresAt,
      },
      create: {
        id: intentId,
        decisionId: data.decisionId,
        opportunityId: data.opportunityId,
        chainId: data.chainId,
        contract: data.contract,
        tokenId: data.tokenId,
        marketplace: data.marketplace,
        expectedPrice: data.expectedPrice,
        maxPrice: data.maxPrice,
        estimatedGas: data.estimatedGas,
        slippageBps: data.slippageBps,
        payload: data.payload as any,
        createdAt: new Date(),
        expiresAt: data.expiresAt,
        executable: false,
      },
    });
  }

  async saveSimulation(result: SimulationResult) {
    return await this.prisma.simulationResultRecord.upsert({
      where: { id: result.id },
      update: {
        state: result.state,
        success: result.success,
        revertReason: result.revertReason,
        payload: result as any,
        expiresAt: new Date(result.expiresAt),
        executable: result.executable,
      },
      create: {
        id: result.id,
        intentId: result.intentId,
        state: result.state,
        success: result.success,
        revertReason: result.revertReason,
        payload: result as any,
        createdAt: new Date(result.simulationTimestamp),
        expiresAt: new Date(result.expiresAt),
        executable: result.executable,
      },
    });
  }
}