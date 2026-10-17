import { evaluateObservation } from "@divora/opportunities";
import type { Opportunity } from "@divora/shared";

const now = new Date("2026-10-08T12:00:00.000Z");
const contract = "0x1111111111111111111111111111111111111111" as const;

export const sampleOpportunities: Opportunity[] = [
  evaluateObservation(
    {
      chainId: 4663,
      chainKey: "robinhood",
      contract,
      tokenId: "29",
      collectionName: "Fixture collection",
      metadataPresent: true,
      observedPrice: "40",
      referencePrice: "100",
      transferCount: 2,
      observedAt: "2026-10-08T11:55:00.000Z",
      source: "ui-fixture",
    },
    {},
    now,
  ),
  evaluateObservation(
    {
      chainId: 4663,
      chainKey: "robinhood",
      contract,
      tokenId: "30",
      collectionName: "Fixture collection",
      metadataPresent: false,
      transferCount: 9,
      priorTransferCount: 2,
      observedAt: "2026-10-08T11:55:00.000Z",
      source: "ui-fixture",
    },
    {},
    now,
  ),
];
