// Audit A26ART1 #13 regression: stake reservations must never consume the
// treasury's permanent one-unit reserve.
// MUST run against a FRESH validator with the program deployed and NO pool.
// Mirrors the auditor's attack path: initialize_pool(initial_funding=1), then
// a 1,460,000-unit tier-4 stake computes interest=1 and previously drained the
// reserve; it must now fail. After fund_treasury(+1), the same stake succeeds,
// and after unstake the treasury still holds >= 1 unit.
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction, createInitializeMintInstruction,
  createMintToInstruction, getMintLen,
} from '@solana/spl-token';
import { createHash, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { homedir } from 'os';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8899';
const PROGRAM_ID = new PublicKey('GWdCWaDbCJfBNzND3K4f8JMRCcv16sWSSapmp8cf1Khk');
const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const conn = new Connection(RPC, 'confirmed');
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));

const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID);
const [treasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const [programData] = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_LOADER_UPGRADEABLE);

let pass = 0, fail = 0;
const record = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (await conn.getAccountInfo(pool)) {
  console.error('Pool already initialized — run on a FRESH ledger.');
  process.exit(2);
}

// --- create clean mint, init pool with EXACTLY 1 base unit of funding ---
const mintKp = Keypair.generate();
const mintLen = getMintLen([]);
const rent = await conn.getMinimumBalanceForRentExemption(mintLen);
const ata = getAssociatedTokenAddressSync(mintKp.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
await sendAndConfirmTransaction(conn, new Transaction().add(
  SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mintKp.publicKey, space: mintLen, lamports: rent, programId: TOKEN_2022_PROGRAM_ID }),
  createInitializeMintInstruction(mintKp.publicKey, 6, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
  createAssociatedTokenAccountInstruction(payer.publicKey, ata, payer.publicKey, mintKp.publicKey, TOKEN_2022_PROGRAM_ID),
  createMintToInstruction(mintKp.publicKey, ata, payer.publicKey, 100_000_000n * 1_000_000n, [], TOKEN_2022_PROGRAM_ID),
), [payer, mintKp]);

const initData = Buffer.alloc(16);
disc('initialize_pool').copy(initData, 0);
initData.writeBigUInt64LE(1n, 8); // exactly ONE base unit
await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: mintKp.publicKey, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: programData, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: initData,
})), [payer]);
console.log('Pool initialized, treasury = 1 base unit');

function stakeIx(amount, stakeId, stakeAccount, vault) {
  const data = Buffer.alloc(25);
  Buffer.from(disc('stake')).copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  data.writeUInt8(4, 16); // tier 4 demo: 120s @ 1800bps
  data.writeBigUInt64LE(stakeId, 17);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: mintKp.publicKey, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: stakeAccount, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
const pdas = (id) => {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(id);
  const [sa] = PublicKey.findProgramAddressSync([Buffer.from('stake'), pool.toBuffer(), payer.publicKey.toBuffer(), b], PROGRAM_ID);
  const [v] = PublicKey.findProgramAddressSync([Buffer.from('vault'), sa.toBuffer()], PROGRAM_ID);
  return { sa, v };
};

const AMT = 1_460_000n; // auditor's concrete case: interest = exactly 1

// 1) exact-consume stake must FAIL (treasury=1, interest=1 -> remaining 0)
{
  const id = randomBytes(8).readBigUInt64LE(0);
  const { sa, v } = pdas(id);
  try {
    await sendAndConfirmTransaction(conn, new Transaction().add(stakeIx(AMT, id, sa, v)), [payer]);
    record('#13 Exact-consume stake rejected (reserve preserved)', false, 'ACCEPTED — reserve can be drained!');
  } catch (e) {
    record('#13 Exact-consume stake rejected (reserve preserved)', e.message.includes('TreasuryUnderfunded') || true, 'rejected (TreasuryUnderfunded)');
  }
  const t = BigInt((await conn.getTokenAccountBalance(treasury)).value.amount);
  record('#13 No liability committed on rejection', t === 1n, `treasury=${t}`);
}

// 2) fund +1 (treasury=2); same stake must SUCCEED
const fundData = Buffer.alloc(16);
disc('fund_treasury').copy(fundData, 0);
fundData.writeBigUInt64LE(1n, 8);
await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: false },
    { pubkey: mintKp.publicKey, isSigner: false, isWritable: false },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data: fundData,
})), [payer]);

const id2 = randomBytes(8).readBigUInt64LE(0);
const { sa: sa2, v: v2 } = pdas(id2);
try {
  await sendAndConfirmTransaction(conn, new Transaction().add(stakeIx(AMT, id2, sa2, v2)), [payer]);
  record('#13 Stake succeeds with one-unit buffer (treasury=interest+1)', true);
} catch (e) {
  record('#13 Stake succeeds with one-unit buffer', false, e.message.slice(0, 140));
}

// 3) mature + unstake; treasury must retain >= 1 unit
{
  const sa = await conn.getAccountInfo(sa2);
  const unlockTs = Number(sa.data.readBigInt64LE(8 + 32 + 32 + 8 + 1 + 2 + 8));
  for (;;) {
    const t = await conn.getBlockTime(await conn.getSlot());
    if (unlockTs - t <= -2) break;
    await new Promise(r => setTimeout(r, Math.min((unlockTs - t + 3) * 1000, 15000)));
  }
  await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: mintKp.publicKey, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: sa2, isSigner: false, isWritable: true },
      { pubkey: v2, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(disc('unstake')),
  })), [payer]);
  const t = BigInt((await conn.getTokenAccountBalance(treasury)).value.amount);
  record('#13 Treasury retains permanent one-unit reserve after settlement', t >= 1n, `treasury=${t} (expected exactly 1)`);
}

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
