# TBB Staking — Current State & Runbook (2026-08-31)

## LIVE RIGHT NOW (local validator)
- Program: `4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae` (deployed, lifecycle-tested)
- Validator: `solana-test-validator --ledger /tmp/tbb-ledger` (background)
- Frontend: `npm run dev` in frontend/ → http://localhost:3000
- Test TBB mint (local only): see frontend/.env.local NEXT_PUBLIC_TBB_MINT
- Pool + treasury initialized; treasury holds 10M test TBB
- Deploy wallet: ~/.config/solana/id.json = GsFnpyNUEny2L7KEfUiN8QtpU29eDJPEZuq3XMFH7yWv

## Proven by tests (scripts in frontend/scripts/)
- setup-local.mjs — mint + pool init + treasury funding
- e2e-test.mjs — stake → vault verified, interest math exact
- lifecycle-test.mjs — stake → early-unstake REJECTED → unlock → principal+interest paid → account closed
- fund-wallet.mjs <ADDR> [TBB] — fund a Phantom wallet with 5 SOL + test TBB

## Restart after reboot
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
solana-test-validator --ledger /tmp/tbb-ledger &   # keeps prior state if ledger dir intact
cd ~/tbb-staking/frontend && npm run dev &
# If ledger was wiped: redeploy + re-setup:
cd ~/tbb-staking/program && solana program deploy target/deploy/tbb_staking.so --program-id target/deploy/tbb_staking-keypair.json --url localhost
cd ../frontend && node scripts/setup-local.mjs && restart dev server
```

## Phantom demo flow
1. Phantom → Settings → Developer Settings → Testnet Mode ON → network: Localhost
2. `node scripts/fund-wallet.mjs <PHANTOM_ADDR>` (5 SOL + 1M test TBB)
3. localhost:3000 → Connect → pick ⚡ 2-Min Demo tier → Stake → watch countdown → claim

## Going to DEVNET (when faucet cooperates — resets every 8h)
```bash
solana config set --url devnet
solana airdrop 2   # need ~3 SOL total for deploy
cd ~/tbb-staking/program && solana program deploy target/deploy/tbb_staking.so --program-id target/deploy/tbb_staking-keypair.json
cd ../frontend && node scripts/setup-local.mjs   # edit RPC const to devnet first
# set NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com in .env.local
```

## Going to MAINNET (checklist — DO NOT skip)
1. **Remove demo tier** from lib.rs TIERS (and frontend TIERS) — it's marked with a comment
2. Point TBB_MINT at the real mint 42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump (remove NEXT_PUBLIC_TBB_MINT override)
3. Professional audit of the program (real money — non-negotiable)
4. Deploy costs ~2.5 SOL; keep upgrade authority on a hardware wallet or multisig
5. Fund treasury with real TBB via fund_treasury (dev-only instruction, checked on-chain)
6. Consider making the pool authority a multisig

## Toolchain landmines solved (see git history / Hermes skill)
- Anchor 0.30.1 + Solana 1.18.17 toolchain on macOS ARM, rustc-1.75-era Cargo.lock:
  ~45 crates pinned to pre-edition2024 versions; lockfile must be generated with
  ~/.cache/solana/v1.41/platform-tools/rust/bin/cargo (not system cargo)
- anchor build must run with `--no-idl` (IDL gen breaks on modern host rustc); frontend
  uses hand-rolled instruction encoding in src/lib/staking.ts (discriminator = sha256("global:<name>")[0..8])
- Anchor contexts with 2 init accounts blow the 4KB SBF stack → Box<> every account
- solana-test-validator on macOS: use --ledger /tmp/... (AppleDouble files corrupt genesis in home dir)
