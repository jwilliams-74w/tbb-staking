import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';

export const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');
export const TBB_MINT = new PublicKey('42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump');

export const TIERS = [
  { name: '1 Month', seconds: 30 * 86400, apr: 500 },  // 5% in basis points
  { name: '3 Months', seconds: 90 * 86400, apr: 800 },
  { name: '6 Months', seconds: 180 * 86400, apr: 1200 },
  { name: '12 Months', seconds: 365 * 86400, apr: 1800 },
];

export function getPoolPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool')],
    PROGRAM_ID
  )[0];
}

export function getTreasuryPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    PROGRAM_ID
  )[0];
}

export function getStakePDA(poolPubkey: PublicKey, stakerPubkey: PublicKey, stakeIndex: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('stake'),
      poolPubkey.toBuffer(),
      stakerPubkey.toBuffer(),
      stakeIndex.toArrayLike(Buffer, 'le', 8),
    ],
    PROGRAM_ID
  )[0];
}

export function getVaultPDA(stakeAccountPubkey: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), stakeAccountPubkey.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function computeInterest(amount: number, aprBps: number, lockSeconds: number): number {
  const SECONDS_PER_YEAR = 31_536_000;
  const principal = BigInt(Math.floor(amount * 1e6)); // TBB has 6 decimals
  const interest = (principal * BigInt(aprBps) * BigInt(lockSeconds)) / (BigInt(10000) * BigInt(SECONDS_PER_YEAR));
  return Number(interest) / 1e6;
}
