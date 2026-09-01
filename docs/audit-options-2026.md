# Solana Audit Options for TBB Staking Program (~430 LOC Anchor) — Researched Sep 2026

Program context: Anchor 0.30.1, ~430 lines single file, 5 instructions, Token-2022 mint, PDA vaults, mainnet target in 4–8 weeks. Note: Token-2022 interaction is explicitly called out by auditors as a complexity/cost adder (source: https://accretion.xyz/blog/solana-audit-cost).

## Per-firm details

### OtterSec (osec.io)
- **Pricing:** NOT public. Quote after scoping ("We'll deliver a quote based on our expected duration, potential vulnerabilities, and the overall complexity"). Third-party market guide places OtterSec at the higher end of a $5K–$50K typical Solana range (https://smithii.io/en/top-3-audit-company-solana/).
- **Intake:** 5-step process on services page: initial discussion → MNDA + repo review → quote → kickoff (findings shared as they emerge) → report. Contact via https://osec.io/contact. Source: https://osec.io/services/
- **Queue/turnaround:** Not published; third-party guides note timeline flexibility needed for well-known names (https://adevarlabs.com/blog/top-6-solana-smart-contract-audit-firms-in-2026 — "want a well-known name and have timeline flexibility").
- **Reputation:** The most Solana-native large firm. Clients: Solana Foundation (core code), Jupiter, Kamino, Marginfi, Sanctum, Zeta, Phoenix, Raydium, Tensor, Squads, Pyth, Jito, Wormhole. Claims $36.82B+ TVL secured. Sources: https://osec.io/services/, https://procur3.io/blog/best-solana-smart-contract-audit-firms-2026
- **Expedited small-program option:** None advertised.

### Neodyme (neodyme.io)
- **Pricing:** NOT public — "Please contact us for a quote" (contact@neodyme.io). Source: https://neodyme.io/blockchain/
- **Intake:** Email contact → quote. Public reports at https://neodyme.io/reports.
- **Queue/turnaround:** Not published. Boutique, senior-heavy, smaller bench — implies scheduling constraints (https://procur3.io/blog/best-solana-smart-contract-audit-firms-2026).
- **Reputation:** Auditing Solana since 2020, founded off core-Solana bug finds; claims $10B+ TVL saved, 100+ core blockchain bugs. Clients/logos: Solana Labs, Jump, Marinade, Lido, Orca, Squads; audited the Token-2022 program itself (https://neodyme.io/reports/Token%202022%20-%202024.pdf) — directly relevant to a Token-2022 staking program. Source: https://neodyme.io/blockchain/
- **Expedited small-program option:** None advertised.

### Sec3 (sec3.dev)
- **Pricing:** Manual "Launch Audit" pricing NOT public (contract directly). X-Ray automated scanner: free tier + paid Build/Scale subscription tiers (prices not public). Sources: https://sec3.dev/blog/sec3-pro-auto-auditor, https://solanacompass.com/projects/sec3
- **Intake:** Contact via sec3.dev; X-Ray self-serve via GitHub integration (pro.sec3.dev).
- **Queue/turnaround:** Not published for manual audits; X-Ray reports "within minutes."
- **Reputation:** 200+ protocols secured; clients incl. Solana Foundation, Solana Labs, Jupiter, Wormhole, Raydium, Orca, Metaplex. $10M seed led by Multicoin; Anatoly Yakovenko angel. Found $20M Jet Protocol bug pre-exploit. Source: https://solanacompass.com/projects/sec3
- **Expedited small-program option:** Yes, sort of — X-Ray automated scan is instant and cheap/free, but it is a scanner, not an audit. Useful as a pre-audit pass on our 430 lines.

### Accretion (accretion.xyz)
- **Pricing:** PUBLIC guidance — the only firm publishing numbers. "$7K–$20K: Simple Program, Full Audit… maybe a single-purpose staking contract… 500–2,000 nSLOC in Anchor. 2 auditors for up to a week, often less." Our ~430 nSLOC program sits at/below the bottom of that band → expect ≈$7K–$12K. Rush premium 20–100% if timeline aggressive. Source: https://accretion.xyz/blog/solana-audit-cost
- **Intake:** DM founder on Telegram (https://t.me/robrto) or contact@accretion.xyz with repo; an auditor reviews for size/complexity and returns a concrete quote "quickly." Source: same.
- **Queue/turnaround:** Small-program engagement itself is ≤1 week with 2 auditors; queue depends on booking ("auditors are often booked out weeks or months — plan ahead"). Source: same.
- **Reputation:** 100% Solana-only boutique; 70+ audits, $3B+ TVL (site) / "50+ protocols, $1.5B TVL" (blog, Apr 2026). Clients: Light Protocol (4x), MetaDAO, Ellipsis, Jupiter, Realms. Reports public at https://github.com/accretion-xyz/audit-reports. Sources: https://accretion.xyz/, https://accretion.xyz/blog/solana-audit-cost
- **Expedited small-program option:** Effectively yes — small scopes are explicitly a ≤1-week product, and rush scheduling available at 20–100% premium.

### Zellic (zellic.io)
- **Pricing:** NOT public. Contact form (https://www.zellic.io/contact).
- **Intake:** Contact → scoping → engagement; reports published at https://github.com/Zellic/publications.
- **Queue/turnaround:** Not published.
- **Reputation:** Top-tier multi-chain with deep Solana/Rust practice. Clients: Solana Foundation, LayerZero, Sui/Mysten, Hyperliquid, Polymarket, Monad, Wormhole, Squads, Star Atlas. 2025 stats: 338 reviews, 247 critical findings. Sources: https://www.zellic.io/, https://procur3.io/blog/best-solana-smart-contract-audit-firms-2026
- **Expedited small-program option:** None advertised; has done pro-bono work for public-goods projects (Protocol Guild) — not applicable to a memecoin.

## Budget alternatives

### Contest platforms (Code4rena / Sherlock / Cantina)
- **Pricing:** Prize pool + platform fee. Basic contests from ~$6,500 (HackenProof comparison: https://hackenproof.com/blog/code4rena-vs-sherlock-crowdsourced-audits-comparison-guide); competitive pools realistically start ~$20K (https://www.zealynx.io/research/audit-ops/cant-afford-smart-contract-audit). Sherlock's own 2026 reference: market $5K–$250K; ~500 nSLOC ≈ 3-day contest window; Rust/Solana carries 25–40% premium (https://sherlock.xyz/post/smart-contract-audit-pricing-a-market-reference-for-2026).
- **Turnaround:** Fixed short windows (days for small scopes) + judging period (typically adds weeks). Solana contests are common now (e.g. Jupiter Lend $107K on Code4rena, Feb 2026: https://code4rena.com/audits/2026-02-jupiter-lend; Solana Foundation $203.5K: https://code4rena.com/audits/2025-08-solana-foundation).
- **Fit:** For a 430-line program a contest likely costs as much as a private Accretion audit while giving less predictable quality and a public codebase freeze. Sherlock uniquely offers post-audit economic coverage (staked against missed criticals): https://procur3.io/blog/best-solana-smart-contract-audit-firms-2026

### Time-boxed / boutique budget reviews
- **Zealynx "Founder Security Sprint":** $500/yr → 2-day senior audit session ($2,400 of time at their $6K/auditor-week rate), written memo, one fix re-check; explicitly NOT a full audit and no "audited by" claim. Firm behind 45 audits incl. Lido work. Source: https://www.zealynx.io/research/audit-ops/cant-afford-smart-contract-audit
- **Adevar Labs:** Solana-focused, "typically start engagements within two weeks," flexible budgets, free consultation; clients LI.FI, DoubleZero, Loopscale, GLAM. Pricing not public. Source: https://adevarlabs.com/blog/top-6-solana-smart-contract-audit-firms-in-2026
- Category norm: time-boxed senior sessions run $500–$5,000 across the market (Zealynx guide above).

## Ranked recommendation for TBB staking (small memecoin staking, Token-2022, 4–8 wk runway)

| Rank | Option | Est. cost | Realistic timeline | Why |
|---|---|---|---|---|
| 1. **Best value** | **Accretion** | ~$7K–$15K (public band; get quote) | ≤1 wk audit + booking lead time; rush possible (+20–100%) | Only firm with public small-program pricing; Solana-only; 2 auditors even at low tier; Telegram intake = fast quote. https://accretion.xyz/blog/solana-audit-cost |
| 2. **Fastest** | **Adevar Labs** (or Accretion rush) | Not public; positioned budget-friendly | Starts within ~2 weeks | Explicit fast-start positioning; hybrid bench. https://adevarlabs.com/blog/top-6-solana-smart-contract-audit-firms-in-2026 |
| 3. **Most prestigious** | **OtterSec** | Not public; high end of $5K–$50K market range | Unknown queue; assume weeks | Biggest Solana name — best marketing value for community trust. https://osec.io/services/ |
| 4. Prestige alt., Token-2022 edge | **Neodyme** | Not public | Unknown; boutique bench | They audited Token-2022 itself. https://neodyme.io/reports/Token%202022%20-%202024.pdf |
| 5. Belt-and-suspenders add-on | **Sec3 X-Ray scan** | Free–low (subscription) | Minutes | Run before any manual audit; not a substitute. https://sec3.dev/blog/sec3-pro-auto-auditor |
| 6. Pre-audit sanity check | **Zealynx sprint** | $500 | Days | 2 senior days on the vault/unstake paths; no "audited" badge. https://www.zealynx.io/research/audit-ops/cant-afford-smart-contract-audit |
| 7. Not recommended here | Contest (C4/Sherlock) | ~$6.5K–$20K+ pool + fees | Contest days + judging weeks | Poor $/value at 430 LOC vs a private boutique audit. https://sherlock.xyz/post/smart-contract-audit-pricing-a-market-reference-for-2026 |
| — | **Zellic** | Not public | Unknown | Superb but oriented to complex/novel systems; likely overkill and over budget for 430 LOC. https://www.zellic.io/ |

**Suggested play:** Sec3 X-Ray (free) now → Accretion quote this week (Telegram, send repo) → book slot immediately given 4–8 wk runway → optionally publicize OtterSec/Neodyme for a v2 or if budget allows a second opinion. Budget ~$10K ± rush premium; add $2–5K contingency for the fix-review round (re-audit rounds typically $5K–$20K industry-wide per Sherlock's guide — small program should be at/below the low end).
