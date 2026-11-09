# Afterbell

Non-custodial web app for buying, selling, and understanding tokenized US stocks on Solana and Ethereum, and Stock Tokens on Robinhood Chain. Solana swaps are routed by Jupiter; Ethereum swaps go through Uniswap v3 and Robinhood Chain swaps through Uniswap v4 (pools can be small, so some orders will be refused or Thin). Your wallet signs everything; Afterbell holds no keys or funds.

Next.js 16 (static export, App Router), React 19, TypeScript strict, pnpm. One Cloudflare Pages Function (`/api/rpc`) relays read-only Solana and EVM RPC (`?chain=ethereum`, `?chain=robinhood`) and reports the visitor's region.

## Run

```bash
pnpm install
pnpm dev            # http://localhost:3000 (no /api/rpc; geo reads as unknown, so trading stays off)
pnpm preview        # builds, then wrangler pages dev with the function (copy .dev.vars.example to .dev.vars first)
pnpm build          # static output in out/
```

Robinhood Chain flow on a local fork (no money, no RPC key; needs [Foundry](https://getfoundry.sh)): `pnpm fork` (first run snapshots mainnet state into `.fork/`, then serves it on 127.0.0.1:8545), set `EVM_RPC_UPSTREAM_URL_ROBINHOOD=http://127.0.0.1:8545` in `.dev.vars`, run `pnpm preview:dev`, open `/e/robinhood/SPY` and pick "Dev wallet (local fork)". The dev wallet exists only in `NEXT_PUBLIC_DEV_WALLET=1` builds on localhost; `pnpm lint:bundle` fails if it reaches a production build. See D-066.

Vercel (alternative host, see D-067): import the repo, keep the detected settings from `vercel.json`, and set the same variables as in Configuration below in Project Settings > Environment Variables (server-only ones without the `NEXT_PUBLIC_` prefix). The Hobby plan is non-commercial only; leave `NEXT_PUBLIC_REFERRAL_ACCOUNT` empty there.

## Check

```bash
pnpm typecheck
pnpm test           # unit tests (vitest)
pnpm test:e2e       # Playwright against out/ with a mocked network and a test wallet
pnpm lint:bundle    # greps out/ for secrets and provider URLs
pnpm registry:validate   # schema only
pnpm registry:check      # schema + on-chain check (needs RPC access; set RPC_URL for Solana, EVM_RPC_URL for Ethereum, EVM_RPC_URL_ROBINHOOD for Robinhood Chain)
```

`CHROME_PATH` can point Playwright at an installed Chromium. `/styleguide` shows the design tokens and components.

## Registry

`registry/issuers.json`, `registry/tokens.json` (Solana), and `registry/evm-tokens.json` (Ethereum and Robinhood Chain; decimals are read from the contract; refresh the Robinhood list with `pnpm registry:sync-robinhood`) are open data. Entries need a source URL and a check date. Add a token only from an official issuer source.

## Configuration

Public, build time (`NEXT_PUBLIC_*`): `SITE_URL`, `REFERRAL_ACCOUNT`, `REFERRAL_FEE_BPS` (50 to 255), `CONTACT_EMAIL`, `RPC_PATH`, `JUPITER_BASE`, `EXPLORER_TX_BASE`.
Server only (Cloudflare variables, never in the repo): `RPC_UPSTREAM_URL`, `EVM_RPC_UPSTREAM_URL_ETHEREUM`, `EVM_RPC_UPSTREAM_URL_ROBINHOOD`, `ALLOWED_ORIGINS`, `BLOCKED_COUNTRIES`, `RATE_LIMIT_PER_MINUTE`. See `.env.example` and `.dev.vars.example`.

## Docs

`docs/DECISIONS.md` (decisions, verification limits, owner steps), `docs/LIGHTHOUSE.md`, `docs/STAGE2-FEE-ROUTER-SPEC.md`, `docs/VISUAL-DIRECTIONS.md`.
