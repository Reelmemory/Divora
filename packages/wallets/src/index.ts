export type WalletMode = "connected";

/** Unsigned transaction request. Signing stays in the user's wallet. */
export interface PreparedTransaction {
  chainId: number;
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

export interface WalletProvider {
  readonly mode: WalletMode;
  getAddress(): Promise<`0x${string}` | null>;
  prepare(tx: PreparedTransaction): Promise<PreparedTransaction>;
  /** Future signing boundary. Phase 4 must not call this for a real signature. */
  sign(): Promise<never>;
}

/**
 * Connected-wallet placeholder. Refuses to sign and stores no key material.
 * Phase 0 does not broadcast.
 */
export class ConnectedWalletProvider implements WalletProvider {
  readonly mode = "connected" as const;

  constructor(private readonly address: `0x${string}` | null = null) {}

  async getAddress(): Promise<`0x${string}` | null> {
    return this.address;
  }

  async prepare(tx: PreparedTransaction): Promise<PreparedTransaction> {
    if (this.address === null) {
      throw new Error("No connected wallet address");
    }
    return { ...tx };
  }

  async sign(): Promise<never> {
    throw new Error("Signing is disabled. Simulation stops before WalletProvider.sign.");
  }
}
