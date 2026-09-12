use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    state::Mint as SplMintState,
};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

// MAINNET ID (deployed build). Devnet still runs this program logic at
// GWdCWaDbCJfBNzND3K4f8JMRCcv16sWSSapmp8cf1Khk from commit eee0083;
// swap declare_id back to that address if a devnet redeploy is ever needed.
declare_id!("4KgvDmEjPJNtbiVhnZ9Cf1i1vgeZdKrCNKhHVTNTkLWT");

pub const SECONDS_PER_YEAR: u128 = 31_536_000; // 365 days
pub const TIER_COUNT: usize = 5;
/// Hard cap on configurable APR: 100%.
pub const MAX_APR_BPS: u16 = 10_000;

/// Default lock tiers used at pool initialization: (seconds, APR in basis points).
/// Audit A26ART1 #12: tiers now live in Pool state and are updatable via `set_tiers`
/// (authority-only, with a scheduled cutover) — no program upgrade required.
pub const DEFAULT_TIERS: [TierConfig; TIER_COUNT] = [
    TierConfig { lock_seconds: 30 * 86_400, apr_bps: 500 },   // 1 month  -> 5% APR
    TierConfig { lock_seconds: 90 * 86_400, apr_bps: 800 },   // 3 months -> 8% APR
    TierConfig { lock_seconds: 180 * 86_400, apr_bps: 1200 }, // 6 months -> 12% APR
    TierConfig { lock_seconds: 365 * 86_400, apr_bps: 1800 }, // 12 months -> 18% APR
    TierConfig { lock_seconds: 365 * 86_400, apr_bps: 1800 }, // slot 5: mirrors 12-month tier (was devnet 2-min DEMO — removed for mainnet per Accretion; adjustable via set_tiers)
];

#[program]
pub mod tbb_staking {
    use super::*;

    /// One-time: dev creates the pool.
    /// Audit A26ART1 #11: only the program's upgrade authority may initialize.
    /// Audit A26ART1 #5/#6/#7/#8: the mint must have no freeze authority and no
    /// dangerous Token-2022 extensions (transfer fee, transfer hook, permanent
    /// delegate, mint close authority).
    /// Audit A26ART1 #5/#6/#7: the treasury must be funded (>= 1 base unit) in
    /// this same instruction so the mint can never be closed and re-created
    /// with different authorities.
    pub fn initialize_pool(ctx: Context<InitializePool>, initial_funding: u64) -> Result<()> {
        require!(initial_funding > 0, StakingError::ZeroAmount);

        // ---- Mint safety validation (audit #5, #6, #7, #8) ----
        let mint = &ctx.accounts.mint;
        require!(
            mint.freeze_authority.is_none(),
            StakingError::MintHasFreezeAuthority
        );
        let mint_info = mint.to_account_info();
        if *mint_info.owner == anchor_spl::token_2022::ID {
            let data = mint_info.try_borrow_data()?;
            let state = StateWithExtensions::<SplMintState>::unpack(&data)?;
            for ext in state.get_extension_types()? {
                match ext {
                    ExtensionType::TransferFeeConfig
                    | ExtensionType::TransferHook
                    | ExtensionType::PermanentDelegate
                    | ExtensionType::MintCloseAuthority => {
                        return err!(StakingError::ForbiddenMintExtension);
                    }
                    _ => {}
                }
            }
        }

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.mint = mint.key();
        pool.treasury = ctx.accounts.treasury.key();
        pool.total_staked = 0;
        pool.total_stakes = 0;
        pool.bump = ctx.bumps.pool;
        pool.tiers = DEFAULT_TIERS;
        pool.pending_tiers = DEFAULT_TIERS;
        pool.tiers_effective_ts = 0;

        // ---- Fund the treasury in the same instruction (audit #5, #6, #7) ----
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.funder_ata,
            &ctx.accounts.mint,
            &ctx.accounts.treasury,
            &ctx.accounts.authority.to_account_info(),
            initial_funding,
            ctx.accounts.mint.decimals,
            None,
        )?;

        Ok(())
    }

    /// Dev deposits TBB into the treasury to cover future interest.
    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.funder_ata,
            &ctx.accounts.mint,
            &ctx.accounts.treasury,
            &ctx.accounts.authority.to_account_info(),
            amount,
            ctx.accounts.mint.decimals,
            None,
        )
    }

    /// Audit A26ART1 #12: authority schedules a new tier table with a cutover
    /// timestamp. The new table takes effect for stakes created at/after
    /// `effective_ts`; existing stakes keep their locked-in terms.
    pub fn set_tiers(
        ctx: Context<SetTiers>,
        new_tiers: [TierConfig; TIER_COUNT],
        effective_ts: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(effective_ts >= now, StakingError::InvalidEffectiveTs);
        for t in new_tiers.iter() {
            require!(t.lock_seconds > 0, StakingError::InvalidTierConfig);
            require!(t.apr_bps <= MAX_APR_BPS, StakingError::InvalidTierConfig);
        }
        let pool = &mut ctx.accounts.pool;
        pool.pending_tiers = new_tiers;
        pool.tiers_effective_ts = effective_ts;
        emit!(TiersScheduled { effective_ts });
        Ok(())
    }

    /// Dev withdraws UNRESERVED treasury funds only. Interest already promised
    /// to stakers can never be touched — the surplus is treasury minus promised.
    /// Audit A26ART1 #5/#6/#7: at least 1 base unit must always remain in the
    /// treasury so the mint can never reach zero circulating supply.
    pub fn withdraw_surplus(ctx: Context<WithdrawSurplus>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        let pool = &ctx.accounts.pool;
        let surplus = ctx
            .accounts
            .treasury
            .amount
            .checked_sub(pool.total_promised_interest)
            .ok_or(StakingError::InsufficientSurplus)?
            .saturating_sub(1); // keep 1 base unit forever in circulation
        require!(amount <= surplus, StakingError::InsufficientSurplus);

        let pool_seeds: &[&[u8]] = &[b"pool", &[pool.bump]];
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.treasury,
            &ctx.accounts.mint,
            &ctx.accounts.authority_ata,
            &ctx.accounts.pool.to_account_info(),
            amount,
            ctx.accounts.mint.decimals,
            Some(&[pool_seeds]),
        )?;

        emit!(SurplusWithdrawn {
            authority: ctx.accounts.authority.key(),
            amount,
            remaining_surplus: surplus - amount,
        });
        Ok(())
    }

    /// User stakes `amount` for a tier. Principal moves to a per-stake PDA vault.
    /// Audit A26ART1 #9: the stake PDA is derived from a caller-chosen `stake_id`
    /// instead of the shared global counter, so concurrent stakers can never
    /// invalidate each other's signed transactions.
    /// Audit A26ART1 #8: the amount actually received by the vault is measured
    /// (pre/post balance + reload) and recorded — never the gross request.
    /// Audit A26ART1 #10: stakes whose computed interest rounds to zero are rejected.
    pub fn stake(ctx: Context<Stake>, amount: u64, tier: u8, stake_id: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        require!((tier as usize) < TIER_COUNT, StakingError::InvalidTier);

        let now = Clock::get()?.unix_timestamp;

        // Audit #12: promote a scheduled tier table once its cutover has passed.
        {
            let pool = &mut ctx.accounts.pool;
            if pool.tiers_effective_ts != 0 && now >= pool.tiers_effective_ts {
                pool.tiers = pool.pending_tiers;
                pool.tiers_effective_ts = 0;
            }
        }
        let TierConfig {
            lock_seconds,
            apr_bps,
        } = ctx.accounts.pool.tiers[tier as usize];
        require!(lock_seconds > 0, StakingError::InvalidTier);

        // Move principal into the stake vault, measuring what actually arrives.
        let vault_before = ctx.accounts.vault.amount;
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.staker_ata,
            &ctx.accounts.mint,
            &ctx.accounts.vault,
            &ctx.accounts.staker.to_account_info(),
            amount,
            ctx.accounts.mint.decimals,
            None,
        )?;
        ctx.accounts.vault.reload()?;
        let received = ctx
            .accounts
            .vault
            .amount
            .checked_sub(vault_before)
            .ok_or(StakingError::MathOverflow)?;
        require!(received > 0, StakingError::ZeroAmount);

        // Interest owed at maturity on the RECEIVED amount (fixed-term product).
        let interest = compute_interest(received, apr_bps, lock_seconds)?;
        // Audit #10: refuse zero-yield locked positions.
        require!(interest > 0, StakingError::ZeroInterest);

        // Treasury must already hold enough to honor this stake's interest,
        // beyond what is already promised to earlier stakers.
        // Audit A26ART1 #13: the post-reservation remainder must keep >= 1 base
        // unit permanently in the treasury (matching withdraw_surplus), so a
        // maturing position can never settle the treasury to zero.
        let pool = &mut ctx.accounts.pool;
        let available = ctx
            .accounts
            .treasury
            .amount
            .checked_sub(pool.total_promised_interest)
            .ok_or(StakingError::TreasuryUnderfunded)?;
        let remaining = available
            .checked_sub(interest)
            .ok_or(StakingError::TreasuryUnderfunded)?;
        require!(remaining >= 1, StakingError::TreasuryUnderfunded);

        let stake_acc = &mut ctx.accounts.stake_account;
        stake_acc.staker = ctx.accounts.staker.key();
        stake_acc.pool = pool.key();
        stake_acc.amount = received;
        stake_acc.tier = tier;
        stake_acc.apr_bps = apr_bps;
        stake_acc.start_ts = now;
        stake_acc.unlock_ts = now
            .checked_add(lock_seconds)
            .ok_or(StakingError::MathOverflow)?;
        stake_acc.interest = interest;
        stake_acc.stake_index = stake_id;
        stake_acc.bump = ctx.bumps.stake_account;

        pool.total_staked = pool
            .total_staked
            .checked_add(received)
            .ok_or(StakingError::MathOverflow)?;
        pool.total_promised_interest = pool
            .total_promised_interest
            .checked_add(interest)
            .ok_or(StakingError::MathOverflow)?;
        pool.total_stakes = pool
            .total_stakes
            .checked_add(1)
            .ok_or(StakingError::MathOverflow)?;

        emit!(Staked {
            staker: stake_acc.staker,
            amount: received,
            tier,
            unlock_ts: stake_acc.unlock_ts,
            interest,
        });
        Ok(())
    }

    /// After unlock: principal returns from vault, interest pays out from treasury,
    /// and the stake account + vault close (rent back to staker).
    /// Audit A26ART1 #3 (HIGH): the FULL vault balance is swept to the staker —
    /// not just the recorded principal — so unsolicited "dust" donations can
    /// never make CloseAccount fail and freeze the position.
    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let stake_acc = &ctx.accounts.stake_account;
        require!(now >= stake_acc.unlock_ts, StakingError::StillLocked);

        let pool_key = ctx.accounts.pool.key();
        let staker_key = ctx.accounts.staker.key();
        let index_bytes = stake_acc.stake_index.to_le_bytes();
        let stake_seeds: &[&[u8]] = &[
            b"stake",
            pool_key.as_ref(),
            staker_key.as_ref(),
            &index_bytes,
            &[stake_acc.bump],
        ];
        let pool_seeds: &[&[u8]] = &[b"pool", &[ctx.accounts.pool.bump]];

        // 1) Sweep the vault's ENTIRE balance to the staker (audit #3).
        let vault_balance = ctx.accounts.vault.amount;
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.staker_ata,
            &ctx.accounts.stake_account.to_account_info(),
            vault_balance,
            ctx.accounts.mint.decimals,
            Some(&[stake_seeds]),
        )?;

        // 2) Pay interest from treasury (authority = pool PDA).
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.treasury,
            &ctx.accounts.mint,
            &ctx.accounts.staker_ata,
            &ctx.accounts.pool.to_account_info(),
            stake_acc.interest,
            ctx.accounts.mint.decimals,
            Some(&[pool_seeds]),
        )?;

        // 3) Close the vault token account, rent to staker. Balance is provably
        //    zero after the full sweep above.
        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token_interface::CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.staker.to_account_info(),
                authority: ctx.accounts.stake_account.to_account_info(),
            },
            &[stake_seeds],
        ))?;

        let pool = &mut ctx.accounts.pool;
        pool.total_staked = pool.total_staked.saturating_sub(stake_acc.amount);
        pool.total_promised_interest =
            pool.total_promised_interest.saturating_sub(stake_acc.interest);

        // Audit A26ART1 #3 follow-up: report the RECORDED principal in `amount`,
        // never the swept balance — otherwise an attacker who dusts the vault
        // inflates the withdrawal figure that off-chain bookkeeping ingests.
        // Unsolicited donations are broken out separately as `dust`.
        emit!(Unstaked {
            staker: staker_key,
            amount: stake_acc.amount,
            dust: vault_balance.saturating_sub(stake_acc.amount),
            interest: stake_acc.interest,
        });
        Ok(())
    }
}

fn compute_interest(amount: u64, apr_bps: u16, lock_seconds: i64) -> Result<u64> {
    let interest = (amount as u128)
        .checked_mul(apr_bps as u128)
        .and_then(|v| v.checked_mul(lock_seconds as u128))
        .and_then(|v| v.checked_div(10_000))
        .and_then(|v| v.checked_div(SECONDS_PER_YEAR))
        .ok_or(StakingError::MathOverflow)?;
    u64::try_from(interest).map_err(|_| StakingError::MathOverflow.into())
}

#[allow(clippy::too_many_arguments)]
fn transfer_tokens<'info>(
    token_program: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let accounts = TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.clone(),
    };
    let cpi = match signer_seeds {
        Some(seeds) => CpiContext::new_with_signer(
            token_program.to_account_info(),
            accounts,
            seeds,
        ),
        None => CpiContext::new(token_program.to_account_info(), accounts),
    };
    token_interface::transfer_checked(cpi, amount, decimals)
}

// ---------------- Accounts ----------------

/// A lock tier: lock duration in seconds + APR in basis points.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug, PartialEq, Eq)]
pub struct TierConfig {
    pub lock_seconds: i64,
    pub apr_bps: u16,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    pub total_staked: u64,
    pub total_promised_interest: u64,
    pub total_stakes: u64,
    pub bump: u8,
    /// Audit #12: on-chain tier table (updatable via set_tiers).
    pub tiers: [TierConfig; TIER_COUNT],
    /// Scheduled replacement table; takes effect at `tiers_effective_ts`.
    pub pending_tiers: [TierConfig; TIER_COUNT],
    /// 0 = no pending cutover.
    pub tiers_effective_ts: i64,
}

#[account]
#[derive(InitSpace)]
pub struct StakeAccount {
    pub staker: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub tier: u8,
    pub apr_bps: u16,
    pub start_ts: i64,
    pub unlock_ts: i64,
    pub interest: u64,
    /// Audit #9: caller-chosen stake id (PDA seed), NOT a shared counter.
    pub stake_index: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool"],
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = pool,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Authority's token account funding the treasury at init (audit #5/#6/#7).
    #[account(mut, token::mint = mint, token::authority = authority)]
    pub funder_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Audit #11: initialization is restricted to the program's upgrade authority.
    #[account(constraint = this_program.programdata_address()? == Some(program_data.key()) @ StakingError::UnauthorizedInitializer)]
    pub this_program: Program<'info, crate::program::TbbStaking>,
    #[account(constraint = program_data.upgrade_authority_address == Some(authority.key()) @ StakingError::UnauthorizedInitializer)]
    pub program_data: Box<Account<'info, ProgramData>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(mut, address = pool.authority)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"pool"], bump = pool.bump, has_one = mint, has_one = treasury)]
    pub pool: Account<'info, Pool>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = authority)]
    pub funder_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SetTiers<'info> {
    #[account(address = pool.authority)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
pub struct WithdrawSurplus<'info> {
    #[account(mut, address = pool.authority)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"pool"], bump = pool.bump, has_one = mint, has_one = treasury)]
    pub pool: Account<'info, Pool>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = authority)]
    pub authority_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(amount: u64, tier: u8, stake_id: u64)]
pub struct Stake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(mut, seeds = [b"pool"], bump = pool.bump, has_one = mint, has_one = treasury)]
    pub pool: Box<Account<'info, Pool>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = staker)]
    pub staker_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = staker,
        space = 8 + StakeAccount::INIT_SPACE,
        seeds = [b"stake", pool.key().as_ref(), staker.key().as_ref(), &stake_id.to_le_bytes()],
        bump
    )]
    pub stake_account: Box<Account<'info, StakeAccount>>,
    #[account(
        init,
        payer = staker,
        token::mint = mint,
        token::authority = stake_account,
        seeds = [b"vault", stake_account.key().as_ref()],
        bump
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(mut, seeds = [b"pool"], bump = pool.bump, has_one = mint, has_one = treasury)]
    pub pool: Box<Account<'info, Pool>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = staker)]
    pub staker_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        close = staker,
        has_one = staker,
        has_one = pool,
        seeds = [b"stake", pool.key().as_ref(), staker.key().as_ref(), &stake_account.stake_index.to_le_bytes()],
        bump = stake_account.bump
    )]
    pub stake_account: Box<Account<'info, StakeAccount>>,
    #[account(mut, seeds = [b"vault", stake_account.key().as_ref()], bump)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ---------------- Events & Errors ----------------

#[event]
pub struct Staked {
    pub staker: Pubkey,
    pub amount: u64,
    pub tier: u8,
    pub unlock_ts: i64,
    pub interest: u64,
}

#[event]
pub struct Unstaked {
    pub staker: Pubkey,
    /// Recorded principal returned (never includes donated dust).
    pub amount: u64,
    /// Unsolicited tokens swept from the vault on top of the principal.
    pub dust: u64,
    pub interest: u64,
}

#[event]
pub struct SurplusWithdrawn {
    pub authority: Pubkey,
    pub amount: u64,
    pub remaining_surplus: u64,
}

#[event]
pub struct TiersScheduled {
    pub effective_ts: i64,
}

#[error_code]
pub enum StakingError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid lock tier")]
    InvalidTier,
    #[msg("Stake is still locked")]
    StillLocked,
    #[msg("Treasury cannot cover the promised interest — dev must fund it")]
    TreasuryUnderfunded,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Withdrawal exceeds unreserved treasury surplus")]
    InsufficientSurplus,
    #[msg("Stake too small: computed interest rounds to zero")]
    ZeroInterest,
    #[msg("Mint has an active freeze authority — not allowed")]
    MintHasFreezeAuthority,
    #[msg("Mint carries a forbidden Token-2022 extension (fee/hook/delegate/close)")]
    ForbiddenMintExtension,
    #[msg("Only the program upgrade authority can initialize the pool")]
    UnauthorizedInitializer,
    #[msg("Invalid tier configuration")]
    InvalidTierConfig,
    #[msg("Cutover timestamp must be in the future")]
    InvalidEffectiveTs,
}
