// Hand-rolled Anchor instruction encoding for tbb_staking (IDL-free).
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

export const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');
export const TBB_MINT = new PublicKey(process.env.NEXT_PUBLIC_TBB_MINT || '42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump');

export const TIERS = [
  { name: '1 Month', days: 30, seconds: 30 * 86400, aprBps: 500 },
  { name: '3 Months', days: 90, seconds: 90 * 86400, aprBps: 800 },
  { name: '6 Months', days: 180, seconds: 180 * 86400, aprBps: 1200 },
  { name: '12 Months', days: 365, seconds: 365 * 86400, aprBps: 1800 },
  { name: '⚡ 2-Min Demo', days: 0, seconds: 120, aprBps: 1800 },
];

// sha256('global:<name>')[0..8] — precomputed in Node (crypto not available in browser sync):
// stake: computed below via subtle crypto at call time; we cache after first use.
const DISCRIMINATORS: Record<string, Uint8Array> = {};

async function disc(name: string): Promise<Uint8Array> {
  if (DISCRIMINATORS[name]) return DISCRIMINATORS[name];
  const data = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  const d = new Uint8Array(hash).slice(0, 8);
  DISCRIMINATORS[name] = d;
  return d;
}

export function getPoolPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID)[0];
}
export function getTreasuryPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID)[0];
}
export function getStakePDA(pool: PublicKey, staker: PublicKey, index: bigint) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(index);
  return PublicKey.findProgramAddressSync([Buffer.from('stake'), pool.toBuffer(), staker.toBuffer(), b], PROGRAM_ID)[0];
}
export function getVaultPDA(stakeAccount: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), stakeAccount.toBuffer()], PROGRAM_ID)[0];
}

export function computeInterest(amountUi: number, aprBps: number, lockSeconds: number): number {
  const SECONDS_PER_YEAR = 31_536_000n;
  const principal = BigInt(Math.floor(amountUi * 1e6));
  const interest = (principal * BigInt(aprBps) * BigInt(lockSeconds)) / (10_000n * SECONDS_PER_YEAR);
  return Number(interest) / 1e6;
}

/** Read pool.total_stakes (u64 at offset 8+32+32+32+8+8 = 120) */
export async function fetchPoolTotalStakes(conn: Connection): Promise<bigint> {
  const info = await conn.getAccountInfo(getPoolPDA());
  if (!info) throw new Error('Pool not initialized');
  // Pool: disc(8) authority(32) mint(32) treasury(32) total_staked(8) total_promised_interest(8) total_stakes(8) bump(1)
  return info.data.readBigUInt64LE(8 + 32 + 32 + 32 + 8 + 8);
}

export async function buildStakeTx(conn: Connection, staker: PublicKey, amountUi: number, tier: number): Promise<Transaction> {
  const pool = getPoolPDA();
  const treasury = getTreasuryPDA();
  const stakeIndex = await fetchPoolTotalStakes(conn);
  const stakeAccount = getStakePDA(pool, staker, stakeIndex);
  const vault = getVaultPDA(stakeAccount);
  const stakerAta = getAssociatedTokenAddressSync(TBB_MINT, staker, false, TOKEN_2022_PROGRAM_ID);

  const amount = BigInt(Math.floor(amountUi * 1e6));
  const d = await disc('stake');
  const data = Buffer.alloc(8 + 8 + 1);
  Buffer.from(d).copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  data.writeUInt8(tier, 16);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: staker, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: TBB_MINT, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: stakerAta, isSigner: false, isWritable: true },
      { pubkey: stakeAccount, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  return new Transaction().add(ix);
}

export async function buildUnstakeTx(staker: PublicKey, stakeAccount: PublicKey): Promise<Transaction> {
  const pool = getPoolPDA();
  const treasury = getTreasuryPDA();
  const vault = getVaultPDA(stakeAccount);
  const stakerAta = getAssociatedTokenAddressSync(TBB_MINT, staker, false, TOKEN_2022_PROGRAM_ID);
  const d = await disc('unstake');

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: staker, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: TBB_MINT, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: stakerAta, isSigner: false, isWritable: true },
      { pubkey: stakeAccount, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(d),
  });
  return new Transaction().add(ix);
}

export interface UserStake {
  address: PublicKey;
  amount: number;      // UI units
  tier: number;
  startTs: number;     // ms
  unlockTs: number;    // ms
  interest: number;    // UI units
  stakeIndex: bigint;
}

/** Fetch all StakeAccounts owned by `staker` via memcmp on the staker field (offset 8). */
export async function fetchUserStakes(conn: Connection, staker: PublicKey): Promise<UserStake[]> {
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: 8 + 32 + 32 + 8 + 1 + 2 + 8 + 8 + 8 + 8 + 1 },
      { memcmp: { offset: 8, bytes: staker.toBase58() } },
    ],
  });
  return accounts.map(({ pubkey, account }) => {
    const d = account.data;
    // disc(8) staker(32) pool(32) amount(8) tier(1) apr_bps(2) start_ts(8) unlock_ts(8) interest(8) stake_index(8) bump(1)
    let o = 8 + 32 + 32;
    const amount = Number(d.readBigUInt64LE(o)) / 1e6; o += 8;
    const tier = d.readUInt8(o); o += 1;
    o += 2; // apr_bps
    const startTs = Number(d.readBigInt64LE(o)) * 1000; o += 8;
    const unlockTs = Number(d.readBigInt64LE(o)) * 1000; o += 8;
    const interest = Number(d.readBigUInt64LE(o)) / 1e6; o += 8;
    const stakeIndex = d.readBigUInt64LE(o);
    return { address: pubkey, amount, tier, startTs, unlockTs, interest, stakeIndex };
  }).sort((a, b) => a.startTs - b.startTs);
}
