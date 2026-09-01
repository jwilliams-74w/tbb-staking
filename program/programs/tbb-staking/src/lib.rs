use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae");

pub const SECONDS_PER_YEAR: u128 = 31_536_000; // 365 days

/// Lock tiers: (seconds, APR in basis points)
pub const TIERS: [(i64, u16); 5] = [
    (30 * 86_400, 500),   // 1 month  -> 5% APR
    (90 * 86_400, 800),   // 3 months -> 8% APR
    (180 * 86_400, 1200), // 6 months -> 12% APR
    (365 * 86_400, 1800), // 12 months -> 18% APR
    (120, 1800),          // DEMO: 2-minute lock (remove before mainnet)
];

#[program]
pub mod tbb_staking {
    use super::*;

    /// One-time: dev creates the pool. Authority = dev wallet.
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.mint = ctx.accounts.mint.key();
        pool.treasury = ctx.accounts.treasury.key();
        pool.total_staked = 0;
        pool.total_stakes = 0;
        pool.bump = ctx.bumps.pool;
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

    /// User stakes `amount` for tier 0..=3. Principal moves to a per-stake PDA vault.
    pub fn stake(ctx: Context<Stake>, amount: u64, tier: u8) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        require!((tier as usize) < TIERS.len(), StakingError::InvalidTier);

        let (lock_seconds, apr_bps) = TIERS[tier as usize];
        let now = Clock::get()?.unix_timestamp;

        // Interest owed at maturity, computed up front (fixed-term product).
        let interest = compute_interest(amount, apr_bps, lock_seconds)?;

        // Treasury must already hold enough to honor this stake's interest,
        // beyond what is already promised to earlier stakers.
        let pool = &mut ctx.accounts.pool;
        let available = ctx
            .accounts
            .treasury
            .amount
            .checked_sub(pool.total_promised_interest)
            .ok_or(StakingError::TreasuryUnderfunded)?;
        require!(available >= interest, StakingError::TreasuryUnderfunded);

        // Move principal into the stake vault.
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

        let stake_acc = &mut ctx.accounts.stake_account;
        stake_acc.staker = ctx.accounts.staker.key();
        stake_acc.pool = pool.key();
        stake_acc.amount = amount;
        stake_acc.tier = tier;
        stake_acc.apr_bps = apr_bps;
        stake_acc.start_ts = now;
        stake_acc.unlock_ts = now
            .checked_add(lock_seconds)
            .ok_or(StakingError::MathOverflow)?;
        stake_acc.interest = interest;
        stake_acc.stake_index = pool.total_stakes;
        stake_acc.bump = ctx.bumps.stake_account;

        pool.total_staked = pool
            .total_staked
            .checked_add(amount)
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
            amount,
            tier,
            unlock_ts: stake_acc.unlock_ts,
            interest,
        });
        Ok(())
    }

    /// After unlock: principal returns from vault, interest pays out from treasury,
    /// and the stake account + vault close (rent back to staker).
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

        // 1) Return principal from the stake vault (authority = stake PDA).
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.staker_ata,
            &ctx.accounts.stake_account.to_account_info(),
            stake_acc.amount,
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

        // 3) Close the vault token account, rent to staker.
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

        emit!(Unstaked {
            staker: staker_key,
            amount: stake_acc.amount,
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
    pub stake_index: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool"],
        bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = pool,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
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
        seeds = [b"stake", pool.key().as_ref(), staker.key().as_ref(), &pool.total_stakes.to_le_bytes()],
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
    pub amount: u64,
    pub interest: u64,
}

#[error_code]
pub enum StakingError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid lock tier (0-3)")]
    InvalidTier,
    #[msg("Stake is still locked")]
    StillLocked,
    #[msg("Treasury cannot cover the promised interest — dev must fund it")]
    TreasuryUnderfunded,
    #[msg("Math overflow")]
    MathOverflow,
}
