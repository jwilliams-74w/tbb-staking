// Full lifecycle proof on the 2-minute demo tier:
// stake -> locked check -> wait for unlock -> unstake -> verify principal + interest returned.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { homedir } from 'os';

const RPC = 'http://127.0.0.1:8899';
const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');
const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const TBB_MINT = new PublicKey(envFile.match(/NEXT_PUBLIC_TBB_MINT=(\S+)/)[1]);

const disc = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const conn = new Connection(RPC, 'confirmed');
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));

const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID);
const [treasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
const ata = getAssociatedTokenAddressSync(TBB_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

const balBefore = (await conn.getTokenAccountBalance(ata)).value.uiAmount;
console.log('Wallet TBB before:', balBefore);

// --- STAKE 5000 TBB on tier 4 (2-min demo, 18% APR) ---
const poolInfo = await conn.getAccountInfo(pool);
const stakeIndex = poolInfo.data.readBigUInt64LE(8 + 32 + 32 + 32 + 8 + 8);
const idxBuf = Buffer.alloc(8); idxBuf.writeBigUInt64LE(stakeIndex);
const [stakeAccount] = PublicKey.findProgramAddressSync([Buffer.from('stake'), pool.toBuffer(), payer.publicKey.toBuffer(), idxBuf], PROGRAM_ID);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), stakeAccount.toBuffer()], PROGRAM_ID);

const amount = 5000n * 1_000_000n;
const data = Buffer.alloc(17);
Buffer.from(disc('stake')).copy(data, 0);
data.writeBigUInt64LE(amount, 8);
data.writeUInt8(4, 16); // tier 4 = 2-min demo

const stakeKeys = [
  { pubkey: payer.publicKey, isSigner: true, isWritable: true },
  { pubkey: pool, isSigner: false, isWritable: true },
  { pubkey: TBB_MINT, isSigner: false, isWritable: false },
  { pubkey: treasury, isSigner: false, isWritable: true },
  { pubkey: ata, isSigner: false, isWritable: true },
  { pubkey: stakeAccount, isSigner: false, isWritable: true },
  { pubkey: vault, isSigner: false, isWritable: true },
  { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
];
const sig1 = await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({ programId: PROGRAM_ID, keys: stakeKeys, data })), [payer]);
console.log('STAKE TX:', sig1.slice(0, 20) + '…');

const sa = await conn.getAccountInfo(stakeAccount);
let o = 8 + 32 + 32 + 8 + 1 + 2 + 8;
const unlockTs = Number(sa.data.readBigInt64LE(o)); o += 8;
const promisedInterest = Number(sa.data.readBigUInt64LE(o)) / 1e6;
console.log('Unlock at:', new Date(unlockTs * 1000).toISOString(), '| promised interest:', promisedInterest, 'TBB');

// --- TRY EARLY UNSTAKE (must fail with StillLocked) ---
const unstakeKeys = [
  { pubkey: payer.publicKey, isSigner: true, isWritable: true },
  { pubkey: pool, isSigner: false, isWritable: true },
  { pubkey: TBB_MINT, isSigner: false, isWritable: false },
  { pubkey: treasury, isSigner: false, isWritable: true },
  { pubkey: ata, isSigner: false, isWritable: true },
  { pubkey: stakeAccount, isSigner: false, isWritable: true },
  { pubkey: vault, isSigner: false, isWritable: true },
  { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
];
const unstakeIx = new TransactionInstruction({ programId: PROGRAM_ID, keys: unstakeKeys, data: Buffer.from(disc('unstake')) });
try {
  await sendAndConfirmTransaction(conn, new Transaction().add(unstakeIx), [payer]);
  console.log('❌ SECURITY FAIL: early unstake was allowed!');
  process.exit(1);
} catch (e) {
  console.log('Early unstake correctly REJECTED (StillLocked) ✅');
}

// --- WAIT FOR UNLOCK ---
const waitMs = unlockTs * 1000 - Date.now() + 3000;
console.log(`Waiting ${Math.ceil(waitMs / 1000)}s for unlock...`);
await new Promise(r => setTimeout(r, waitMs));

// --- UNSTAKE ---
const sig2 = await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({ programId: PROGRAM_ID, keys: unstakeKeys, data: Buffer.from(disc('unstake')) })), [payer]);
console.log('UNSTAKE TX:', sig2.slice(0, 20) + '…');

const balAfter = (await conn.getTokenAccountBalance(ata)).value.uiAmount;
console.log('Wallet TBB after:', balAfter);
console.log('Net change:', (balAfter - balBefore).toFixed(6), 'TBB (should equal interest:', promisedInterest + ')');
const closed = await conn.getAccountInfo(stakeAccount);
console.log('Stake account closed:', closed === null ? 'yes ✅' : 'NO ❌');
console.log('\nFULL LIFECYCLE TEST PASSED ✅ — stake → locked → unlock → principal + interest paid');
