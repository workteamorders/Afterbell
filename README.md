# Afterbell

Non-custodial web app for buying, selling, and understanding tokenized US stocks on Solana and Ethereum. Solana swaps are routed by Jupiter; Ethereum swaps go through Uniswap v3 (token pools there are small, so many orders will be refused or Thin). Your wallet signs everything; Afterbell holds no keys or funds.

Next.js 16 (static export, App Router), React 19, TypeScript strict, pnpm. One Cloudflare Pages Function (`/api/rpc`) relays read-only Solana and Ethereum RPC (`?chain=ethereum`) and reports the visitor's region.

## Run

```bash
pnpm install
pnpm dev            # http://localhost:3000 (no /api/rpc; geo reads as unknown, so trading stays off)
pnpm preview        # builds, then wrangler pages dev with the function (copy .dev.vars.example to .dev.vars first)
pnpm build          # static output in out/
```

## Check

```bash
pnpm typecheck
pnpm test           # unit tests (vitest)
pnpm test:e2e       # Playwright against out/ with a mocked network and a test wallet
pnpm lint:bundle    # greps out/ for secrets and provider URLs
pnpm registry:validate   # schema only
pnpm registry:check      # schema + on-chain check (needs RPC access; set RPC_URL for Solana, EVM_RPC_URL for Ethereum)
```

`CHROME_PATH` can point Playwright at an installed Chromium. `/styleguide` shows the design tokens and components.

## Registry

`registry/issuers.json`, `registry/tokens.json` (Solana), and `registry/evm-tokens.json` (Ethereum; decimals are read from the contract) are open data. Entries need a source URL and a check date. Add a token only from an official issuer source.

## Configuration

Public, build time (`NEXT_PUBLIC_*`): `SITE_URL`, `REFERRAL_ACCOUNT`, `REFERRAL_FEE_BPS` (50 to 255), `CONTACT_EMAIL`, `RPC_PATH`, `JUPITER_BASE`, `EXPLORER_TX_BASE`.
Server only (Cloudflare variables, never in the repo): `RPC_UPSTREAM_URL`, `EVM_RPC_UPSTREAM_URL_ETHEREUM`, `ALLOWED_ORIGINS`, `BLOCKED_COUNTRIES`, `RATE_LIMIT_PER_MINUTE`. See `.env.example` and `.dev.vars.example`.

## Docs

`docs/DECISIONS.md` (decisions, verification limits, owner steps), `docs/LIGHTHOUSE.md`, `docs/STAGE2-FEE-ROUTER-SPEC.md`, `docs/VISUAL-DIRECTIONS.md`.
