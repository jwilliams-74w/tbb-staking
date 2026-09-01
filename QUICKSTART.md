# TBB Staking Platform — Quick Start

Complete Solana staking dApp for The Bitcoin Bull (TBB) token.

## What's Built

### ✅ Solana Program (`program/`)
- Full Anchor 0.30 program with 4 lock tiers
- Per-second interest accrual (5%/8%/12%/18% APR)
- PDA vault security — user funds never touch hot wallets
- Treasury underfunding protection
- `initialize_pool`, `fund_treasury`, `stake`, `unstake` instructions

### ✅ Frontend (`frontend/`)
- Next.js 14 App Router
- Wallet adapter (Phantom, Solflare, Cake Wallet)
- TBB-branded dark UI (orange accents, countdown timers)
- Real-time interest calculator
- Responsive grid layout

## Deploy to Devnet

### 1. Install Prerequisites
```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
```

### 2. Build & Deploy Program
```bash
cd program
anchor build
anchor keys sync  # updates program ID everywhere

# Get devnet SOL
solana config set --url devnet
solana airdrop 2

# Deploy
anchor deploy
```

### 3. Initialize Pool (one-time, as dev)
```bash
# The program ID and mint are already in the code
# Run this once to create the pool + treasury PDAs
anchor run initialize
```

### 4. Fund Treasury
You need to deposit TBB into the treasury to cover interest payments. Write a small script or use Anchor client:

```typescript
const amountToFund = new BN(1_000_000 * 1e6); // 1M TBB
await program.methods
  .fundTreasury(amountToFund)
  .accounts({ /* ... */ })
  .rpc();
```

### 5. Start Frontend
```bash
cd ../frontend
npm install
npm run dev
# Open http://localhost:3000
```

## Complete Frontend Integration

The frontend has transaction *structure* ready but needs the Anchor IDL. To wire it up:

1. **Export the IDL** after building:
   ```bash
   cd program
   anchor build
   cp target/idl/tbb_staking.json ../frontend/src/lib/idl.json
   ```

2. **Import in frontend** (`src/lib/anchor.ts`):
   ```typescript
   import idl from './idl.json';
   import { Program } from '@coral-xyz/anchor';
   
   export function getProgram(provider: AnchorProvider) {
     return new Program(idl as any, PROGRAM_ID, provider);
   }
   ```

3. **Uncomment transaction code** in `StakingInterface.tsx` (marked with `TODO`)

4. **Fetch user stakes** in `UserDashboard.tsx`:
   ```typescript
   const stakes = await program.account.stakeAccount.all([
     { memcmp: { offset: 8, bytes: publicKey.toBase58() } }
   ]);
   ```

## Testing Locally

```bash
# Start local validator
solana-test-validator

# In another terminal
cd program
anchor test
```

## Mainnet Deployment

1. Switch to mainnet: `solana config set --url mainnet-beta`
2. Fund your wallet with real SOL
3. Deploy: `anchor deploy --provider.cluster mainnet`
4. Initialize pool with the real TBB mint
5. Fund treasury with real TBB
6. Update frontend `.env`: `NEXT_PUBLIC_CLUSTER=mainnet-beta`

## Architecture

- **Pool PDA** (`seeds: ["pool"]`) — config + stats
- **Treasury PDA** (`seeds: ["treasury"]`, authority=pool) — holds TBB for interest payouts
- **Stake Account PDA** (`seeds: ["stake", pool, staker, index]`) — tracks one user's stake
- **Vault PDA** (`seeds: ["vault", stake_account]`) — holds the staked principal

Interest = `(principal × APR_bps × lock_seconds) / (10_000 × 31_536_000)`

All math in u128 with checked ops — no overflow exploits.

## Security Notes

- Early withdrawal is impossible (no instruction exists)
- Treasury can only pay out via `unstake` after the lock expires
- Stake vault authority is the stake PDA — only the program can move funds
- Treasury funding check: can't stake if treasury balance < promised interest

## Token Details

- **TBB Mint**: `42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump`
- **Program**: Token-2022 (SPL Token 2022)
- **Decimals**: 6

Built for @GoingParabolic by Hermes Agent.
