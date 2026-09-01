# TBB Staking Platform

Solana-based staking platform for The Bitcoin Bull (TBB) token.

## Features
- 4 lock duration tiers: 1M (5% APR), 3M (8% APR), 6M (12% APR), 12M (18% APR)
- On-chain interest calculation (per-second accrual)
- Real-time countdown timers per stake
- Secure PDA vault architecture — user funds never touch a hot wallet
- Dev-funded treasury pays interest in TBB

## Tech Stack
- **Program**: Anchor 0.30 (Solana Rust framework)
- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: TailwindCSS
- **Wallet**: @solana/wallet-adapter (Phantom, Solflare, Cake Wallet compatible)

## Setup

### Prerequisites
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
```

### Build & Deploy
```bash
cd program
anchor build
anchor keys sync          # writes the real program id into lib.rs + Anchor.toml

# Devnet first
solana airdrop 2 --url devnet
anchor deploy --provider.cluster devnet

# Frontend
cd ../frontend
npm install
npm run dev
```

## Architecture

### On-Chain Program (instructions)
- `initialize_pool` — dev creates the pool config + treasury token account (PDA)
- `fund_treasury` — dev deposits TBB to pay future interest
- `stake` — user locks TBB for a chosen tier; tokens move to a per-stake PDA vault
- `unstake` — after lock expiry, returns principal + accrued interest from treasury

### Interest Rates (APR, basis points on-chain)
| Tier | Lock | APR |
|---|---|---|
| 0 | 1 month (30d) | 5% |
| 1 | 3 months (90d) | 8% |
| 2 | 6 months (180d) | 12% |
| 3 | 12 months (365d) | 18% |

Interest = principal × APR_bps / 10_000 × lock_seconds / SECONDS_PER_YEAR, paid in TBB.

### Security properties
- Principal sits in a PDA vault only the program can move
- Treasury is a PDA; dev can fund it but withdrawals only flow through `unstake`
- Early withdrawal is impossible by construction (no instruction exists for it)
- All math in u128 with checked ops — no overflow, no rounding exploits

## Token
TBB mint: `42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump` (Token-2022 program)
