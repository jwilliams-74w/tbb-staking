# TBB Staking — Current State & Runbook (updated 2026-09-02)

## LIVE ON DEVNET (public network) — primary environment
- Program: `4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae` (includes withdraw_surplus)
- **Public frontend: https://tbb-staking-going-parabolic.vercel.app** (Vercel, project tbb-staking, team going-parabolic)
- Devnet test mint: `H4wtj4ou9YYcXPHkt8i95t6xWT8KQDugYk72CFyA4pJr`
- Pool: `QB8dcHsjAtdnbMS4rU7X2p3tHi58paC6wrEWBHbB4nM` | Treasury: 10M test TBB
- 12/12 adversarial tests PASS on devnet; full stake→claim lifecycle proven from Jason's Phantom
- GitHub (PUBLIC): https://github.com/jwilliams-74w/tbb-staking (gh CLI authed as jwilliams-74w)
- Audit: quote requested from Accretion (contact@accretion.xyz, 2026-09-02) — see docs/audit-options-2026.md
- frontend/.env.local → devnet; localnet config preserved in frontend/.env.localnet.bak

## LOCAL VALIDATOR (still available for dev)
- Validator: `solana-test-validator --ledger /tmp/tbb-ledger` (background)
- Frontend: `npm run dev` in frontend/ → http://localhost:3000 (uses whatever .env.local points at)
- Local mint/pool state intact on the ledger; to use it, swap .env.localnet.bak back in
- Deploy wallet: ~/.config/solana/id.json = GsFnpyNUEny2L7KEfUiN8QtpU29eDJPEZuq3XMFH7yWv (~3.3 devnet SOL left)

## Proven by tests (scripts in frontend/scripts/)
- setup-local.mjs — mint + pool init + treasury funding
- e2e-test.mjs — stake → vault verified, interest math exact
- lifecycle-test.mjs — stake → early-unstake REJECTED → unlock → principal+interest paid → account closed
- fund-wallet.mjs <ADDR> [TBB] — fund a Phantom wallet with 5 SOL + test TBB
- adversarial-test.mjs — 12-case attack suite (2026-09-01, ALL PASS): zero amount, invalid tiers (5/255), over-balance stake, treasury-underfund guard, cross-wallet theft, foreign-ATA payout redirect, early unstake, exact payout math, double unstake, pool accounting restore, non-authority fund_treasury
- verify-integrity.mjs — audits every live stake's interest vs formula, checks Pool totals == Σ stakes, treasury solvency; auto-unstakes unlocked demo-tier leftovers
- withdraw-surplus-test.mjs — withdraw_surplus instruction (2026-09-01, 6/6 PASS): authority-only, capped at treasury minus promised interest (staker rewards untouchable), exact balance moves, round-trip refund

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
