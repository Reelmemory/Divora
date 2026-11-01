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
packages/agent  Lifecycle worker + Otari market analysis adapter
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

Copy `.env.example` to `.env` and fill in your local credentials. Never commit `.env`.

## Otari hosted AI gateway

Divora sends opportunity observations to Otari's OpenAI-compatible Chat Completions endpoint for advisory market analysis. Configure:

- `OTARI_AI_TOKEN`: your Otari hosted-platform API token
- `OTARI_BASE_URL`: defaults to `https://api.otari.ai/api/v1`
- `OTARI_MODEL`: defaults to `openai:gpt-4o-mini`

Add a provider key (for example, OpenAI) in your Otari account so the gateway can route the selected model. The Otari response is treated as untrusted advisory context: deterministic Divora risk and policy checks remain authoritative. Otari cannot sign, broadcast, construct calldata, or override policy.

The agent defaults to Robinhood Chain (4663). Live discovery requires `OPENSEA_API_KEY`. Synthetic listings are disabled by default; set `allowSyntheticFallback` explicitly only for local tests. The collection allowlist is empty by default, so BUY decisions remain blocked until `DIVORA_ALLOWED_COLLECTIONS` is configured.

The current worker does not submit transactions. Simulation reports unavailable unless a real simulator is configured.
