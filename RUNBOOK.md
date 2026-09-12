# TBB Staking — Current State & Runbook (updated 2026-09-07, post-audit-remediation)

## AUDIT (Accretion, A26ART1) — ✅ COMPLETE, FINAL SIGN-OFF 9/12/26
- Findings repo: https://github.com/accretion-xyz/2026-artemis-capital-llc-audit-A26ART1/issues
- ALL findings remediated AND fix-reviewed. #3 follow-up (event bookkeeping, eee0083) approved by brymko ("LGTM now") 9/12; issue closed. Only meta tracker issues remain open.
- Accretion recommendation implemented: demo tier REMOVED from DEFAULT_TIERS for mainnet (slot 5 now mirrors 12-month tier). Frontend hides tier 5 unless NEXT_PUBLIC_SHOW_DEMO_TIER=1.

## MAINNET (READY TO DEPLOY — pending funding + authority decision)
- Program ID: `4KgvDmEjPJNtbiVhnZ9Cf1i1vgeZdKrCNKhHVTNTkLWT` — declare_id! now set to this (mainnet build). Keypair: program/target/deploy/tbb_staking-mainnet-keypair.json (gitignored) + NAS /Volumes/Ai-Vault/Documents/TBB/staking-keys/
- Mainnet binary built + REHEARSED on local validator under the mainnet ID: pool init, e2e stake, tier table verified (verify-tiers.mjs: no lock < 30d), adversarial guards 1-8 pass. Binary sha256 1c3a6e9f34fc… (commit this-commit). NOTE: differs from audited eee0083 binary ONLY in declare_id + tier-5 constant.
- Deploy sequence: (1) fund deploy wallet GsFnpyNUEny2L7KEfUiN8QtpU29eDJPEZuq3XMFH7yWv w/ ~3.5 mainnet SOL → (2) `solana program deploy target/deploy/tbb_staking.so --program-id target/deploy/tbb_staking-mainnet-keypair.json --url mainnet-beta` → (3) init pool w/ REAL mint 42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump + initial_funding from Jason's TBB ATA (setup script w/ PROGRAM_ID + mainnet RPC + real-mint mode) → (4) MOVE UPGRADE AUTHORITY to hardware wallet/multisig (decision pending) → (5) fund_treasury w/ real interest budget (amount pending) → (6) Vercel env: NEXT_PUBLIC_PROGRAM_ID=4Kgv…, NEXT_PUBLIC_TBB_MINT=42cX…, paid RPC → (7) canary stake + verify-integrity.mjs before announcing.
- All scripts accept PROGRAM_ID env override (default remains devnet GWdC…).

## LIVE ON DEVNET (public network) — regression environment
- #13: stake now requires (available - interest) >= 1 base unit post-reservation — treasury can never settle to zero. Test: issue13-reserve-test.mjs (fresh ledger, 4/4). Devnet in-place upgrade queued on faucet cron (needs ~2.3 SOL buffer).
- Key program changes: full-vault sweep on unstake; mint validated at init (no freeze auth / fee / hook / permanent delegate / close auth); treasury seeded ≥1 unit at init and floor kept by withdraw_surplus; stake PDA seeded by caller-random stake_id; interest>0 required; init gated to program upgrade authority (pass program + programdata accounts); tiers live in Pool state w/ set_tiers + scheduled cutover
- stake ix args now (amount: u64, tier: u8, stake_id: u64); initialize_pool takes (initial_funding: u64) + funder_ata + program + programdata accounts
- Test suites: e2e, lifecycle, adversarial (12), audit-regression-test.mjs (7), hostile-mint-test.mjs (6 — needs FRESH ledger, no pool)

## MAINNET (reserved, NOT deployed)
- Program ID: `4KgvDmEjPJNtbiVhnZ9Cf1i1vgeZdKrCNKhHVTNTkLWT` — keypair at program/target/deploy/tbb_staking-mainnet-keypair.json (gitignored) + NAS backup /Volumes/Ai-Vault/Documents/TBB/staking-keys/. Given to Accretion 9/10 for the report.
- Frontend PROGRAM_ID now env-driven: NEXT_PUBLIC_PROGRAM_ID (falls back to devnet GWdC…). Mainnet cutover = set env var in Vercel + swap declare_id! + rebuild + deploy.

## LIVE ON DEVNET (public network) — primary environment
- Program: `GWdCWaDbCJfBNzND3K4f8JMRCcv16sWSSapmp8cf1Khk` (audited build; old 4GgJ… program closed, rent reclaimed)
- **Public frontend: https://tbb-staking-going-parabolic.vercel.app** (Vercel, project tbb-staking, team going-parabolic)
- Devnet test mint: `8vNYqyPKx1Rr9919c2Fa4RsbRB2PhxwcctCi5yrebDL3`
- Pool: `HpasThWQReRyKDi46DJz61scgvLG7HC8M3RkgqrEsfo` | Treasury: `B1h7kkukCEASkLQ3WQwZz4s9rX6C5fvivH62eQeVhMog` (10M+1 test TBB)
- GitHub (PUBLIC): https://github.com/jwilliams-74w/tbb-staking (gh CLI authed as jwilliams-74w)
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
1. **Replace demo tier via `set_tiers`** (authority-only, scheduled cutover) — no program upgrade needed; also update frontend TIERS
2. Point TBB_MINT at the real mint 42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump (remove NEXT_PUBLIC_TBB_MINT override). NOTE: initialize_pool now REJECTS mints with freeze authority or fee/hook/permanent-delegate/close extensions — real TBB (plain pump.fun SPL) passes. Init requires the upgrade-authority wallet + initial_funding ≥ 1 unit.
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
