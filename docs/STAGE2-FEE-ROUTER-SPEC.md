# Stage 2: fee-router program (specification and test plan)

Status: **not built. Stopped at the toolchain check.** The task says that if Rust, Solana CLI, or Anchor are missing, do not install them automatically: write the specification and test plan, stop Stage 2, and report.

## Toolchain check (2026-11-04)

| Tool | Cloud workspace | Owner's Mac (linked VM shell) |
|---|---|---|
| rustc / cargo | present | not found |
| Solana CLI (`solana`, `solana-test-validator`) | not found | not found |
| Anchor (`anchor`) | not found | not found |

Nothing was installed. Gate P needs `solana-test-validator`, which is missing in both places.

## Gate P: not run

Gate P asks for proof, on a localnet with cloned accounts, that a Jupiter swap CPI from a vault owned by the program's PDA works. **No such proof exists.** No result below is a finding; they are open questions.

| Question | State |
|---|---|
| Can a Jupiter swap CPI run from a PDA-owned vault on localnet? | Unproven. Needs `solana-test-validator` with Jupiter program accounts cloned from mainnet (read-only clone). |
| Can a Jupiter referral account be owned by a PDA? | Unknown. Jupiter's fees page (fetched 2026-11-04) says nothing about PDA ownership; its examples use an ordinary keypair as payer and partner. Ask Jupiter (info@jup.ag) or test on localnet. |
| Does Swap v2 `/order` (the API the web app uses) return a transaction that can be wrapped in a CPI? | Unknown. `/order` returns a ready transaction with the taker as signer, which is built for a wallet, not a program. Whether a CPI-friendly instruction path exists must be read from Jupiter's current docs before any program is written. |

**Decision recorded:** use the **fallback plan** until Gate P passes. The program has `distribute()` only: it splits the vault balance between the treasury and a buyback wallet. The operator does the buyback by hand and writes an on-chain memo for each one. The CPI path is added only if Gate P proves it.

## Purpose

A small Anchor program that holds **only operator revenue, never user funds**, and splits it by fixed on-chain rules.

## Accounts

- **Config (PDA, seeds `["config"]`)**: set once in `initialize`, never changed after.
  - `treasury_bps: u16`, `buyback_bps: u16`. Constraint: `treasury_bps + buyback_bps == 10_000`.
  - `treasury: Pubkey`, `buyback_wallet: Pubkey`, `revenue_mint: Pubkey`.
  - `max_per_call: u64` (cap on amount moved by one call), `min_interval_secs: i64`, `max_tip_lamports: u64` (cap on the caller tip), `last_call_ts: i64`.
  - `bump: u8`.
  - No setter instruction exists. Changing a value needs a new deployment and a new Config.
- **Vault (token account owned by the Config PDA)**: holds revenue in `revenue_mint`. Filled manually or by an operator script that moves referral fees in. Automatic filling only if Gate P proves it safe.

## Instructions

1. `initialize(params)`: creates Config and Vault. Rejects bps that do not sum to 10,000, zero caps, and a zero interval. The payer becomes no one special: there is no admin field.
2. `distribute()` (fallback plan): callable by anyone.
   - Reads Vault balance `B`. Moves `min(B, max_per_call)` split by bps: `treasury_amount = floor(amount * treasury_bps / 10_000)`, the remainder to the buyback wallet, so the two always sum to `amount`.
   - Requires `now - last_call_ts >= min_interval_secs`, then sets `last_call_ts = now`.
   - Pays the caller a tip of `min(max_tip_lamports, tip_requested)` lamports. The tip comes from a small SOL balance held by the Config PDA, topped up by the operator. If that balance is too low, the tip is 0 and the call still works.
   - Emits `Distributed { amount, treasury_amount, buyback_amount, caller, ts }`.
3. `execute()` (**only if Gate P passes**): swaps the buyback share through Jupiter by CPI, then burns the output. Same caller, cap, and interval rules. Target mint is a parameter. Not specified further until Gate P has evidence.
4. `sweep_treasury()`: moves the treasury share to the treasury, per bps, with the same cap and interval rules. If `distribute()` already pays the treasury, this instruction is dropped to keep one path.

There is **no** instruction that moves funds anywhere else: no admin withdraw, no arbitrary transfer, no `close` on the Vault that sends funds to a chosen address.

## Events

`Initialized`, `Distributed`, `Executed` (only if built), `Swept`. One per state-changing action.

## Limits and rules

- Localnet and devnet only. **Mainnet needs an external audit and an explicit owner decision.**
- **No token is created.** The target mint is a parameter. Tests use test mints created inside the test.
- **Upgrade authority:** during development, the developer's keypair on localnet/devnet. Before any mainnet use: move it to a multisig held by named owners, then revoke it after the audit. The plan and holders are written here and in `docs/DECISIONS.md` before deployment. Right now: not assigned, nothing deployed.
- No user funds. The web app never sends user tokens to this program.

## Test plan

Unit tests (Anchor, TypeScript or Rust):

1. `initialize` rejects bps that do not sum to 10,000, including overflow-sized values.
2. `initialize` cannot run twice.
3. `distribute` on an empty vault moves 0 and does not fail unexpectedly.
4. `distribute` respects `max_per_call` and leaves the remainder in the Vault.
5. `distribute` is rejected before `min_interval_secs` has passed; allowed right after.
6. Tip never exceeds `max_tip_lamports` and never exceeds the PDA's SOL balance.
7. Wrong Vault, wrong treasury, and wrong buyback accounts are rejected.
8. Events are emitted with the amounts that actually moved.

Property tests (for example `proptest` or a randomized TypeScript loop):

- For any balance, caps, and valid bps: `amount_out <= vault_balance`.
- For any valid bps: `treasury_bps + buyback_bps == 10_000`, and `treasury_amount + buyback_amount == amount` exactly (no dust lost or created).
- Rounding never favors the caller or creates tokens.
- For any sequence of calls: the sum paid out never exceeds the sum paid in.
- Static check: the program's instruction list contains no path that transfers Vault tokens except to `treasury` and `buyback_wallet`.

Gate P procedure (when the toolchain exists):

1. Start `solana-test-validator` with Jupiter and token program accounts cloned from mainnet, read-only.
2. Create a test mint and fund a PDA-owned Vault with test tokens.
3. Attempt a swap CPI from the Vault. Record the transaction logs, success or failure, and the reason.
4. Try to create a Jupiter referral account owned by the PDA. Record the result.
5. Write the evidence in `docs/DECISIONS.md` and choose `execute()` or the fallback.

## What the owner needs to do for Stage 2

- Install Rust, Solana CLI, and Anchor on a machine they control, or approve installing them here.
- Decide the revenue mint, treasury wallet, buyback wallet, caps, and bps.
- Decide who holds the upgrade authority, and book an external audit before any mainnet use.
