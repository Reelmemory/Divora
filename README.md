# Divora

Phase 0 foundation for an AI-powered NFT trading agent. No buying, selling, signing, or autonomous execution is implemented.

Security boundary: the AI may only emit a structured action. A deterministic policy must accept it before any transaction builder, simulation, or user-wallet signature. Private keys never enter this repository's runtime.

## Layout

```
apps/web        Next.js foundation UI
apps/terminal   Health server and job-queue factory
packages/shared Lifecycle types
packages/chains ChainAdapter and Robinhood Chain config
packages/wallets WalletProvider interface (connected mode only)
packages/policy TradingConstitution, fail-closed
packages/agent  Lifecycle context types
packages/nft    Collection and listing types
prisma/         Schema foundation
scripts/        Chain smoke test (read-only)
```

## Checks

```bash
npm install
npm run prisma:generate
npm run typecheck
npm run build
npm run prisma:validate
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com ROBINHOOD_CHAIN_ID=4663 npm run smoke:chain
```

Copy `.env.example` to `.env` for local placeholders. Do not commit `.env`.
