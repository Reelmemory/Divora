# Divora project state

## Phase 0–11

Non-executing. Signing and broadcast remain disabled.

## Phase 11 live fulfillment & Seaport RPC buy simulation

Verified on Robinhood Chain 4663:

- Dynamic Seaport consideration parsing extracts payment token address, seller consideration, and marketplace fee bps directly from OpenSea orders.
- `runListingPipeline` ranks ETH listings ahead of WETH and USDG without comparing raw cross-currency amounts.
- Live `POST /api/v2/listings/fulfillment_data` with an explicit buyer address returned HTTP 200 and valid `seaport1.6` `fulfillBasicOrder_efficient_6GL6yc` parameters for an active ETH listing on `onlyhoodpixel`.
- Read-only Robinhood RPC `eth_call` and `estimateGas` via `simulateFulfillmentBuy` succeeded (`SIMULATED_SUCCESS`, `fulfilled: true`, gas estimate `164050`) without retaining raw calldata or signing/broadcasting.
- Swap quotes remain fail-closed (`UNAVAILABLE`) without provider keys.

## Next step

Do not sign or broadcast. Configure PostgreSQL (`DATABASE_URL`) to verify live Prisma snapshot persistence when ready.
