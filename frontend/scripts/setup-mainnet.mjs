// MAINNET pool initialization for TBB staking.
// Uses the REAL TBB mint and the deploy wallet's existing ATA.
// Initializes the pool with the FULL treasury seed in one instruction
// (initialize_pool moves initial_funding from funder ATA -> treasury).
// Run: PROGRAM_ID=4Kgv... RPC_URL=<mainnet rpc> node scripts/setup-mainnet.mjs
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { homedir } from 'os';

const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '4KgvDmEjPJNtbiVhnZ9Cf1i1vgeZdKrCNKhHVTNTkLWT');
const TBB_MINT = new PublicKey('42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump');
const TREASURY_SEED = 5_000_000n * 1_000_000n; // 5,000,000 TBB (6 decimals)

const disc = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const conn = new Connection(RPC, 'confirmed');
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));
console.log('Authority (deploy wallet):', payer.publicKey.toBase58());

const ataAddr = getAssociatedTokenAddressSync(TBB_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
const bal = await conn.getTokenAccountBalance(ataAddr);
console.log('Funder ATA:', ataAddr.toBase58(), '| balance:', bal.value.uiAmountString, 'TBB');
if (BigInt(bal.value.amount) < TREASURY_SEED) {
  console.error(`ABORT: ATA holds ${bal.value.amount}, need ${TREASURY_SEED}`);
  process.exit(1);
}

const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID);
const [treasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
const existing = await conn.getAccountInfo(pool);
if (existing) {
  console.error('ABORT: pool already initialized at', pool.toBase58());
  process.exit(1);
}

const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const [programData] = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_LOADER_UPGRADEABLE);

const initData = Buffer.alloc(16);
disc('initialize_pool').copy(initData, 0);
initData.writeBigUInt64LE(TREASURY_SEED, 8);
const initIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: TBB_MINT, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: ataAddr, isSigner: false, isWritable: true },
    { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: programData, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: initData,
});

const tx = new Transaction().add(
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
  initIx,
);
const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed' });
console.log('INIT TX:', sig);
console.log('Pool:', pool.toBase58());
console.log('Treasury:', treasury.toBase58());
const tbal = await conn.getTokenAccountBalance(treasury);
console.log('Treasury balance:', tbal.value.uiAmountString, 'TBB');
console.log('DONE');
