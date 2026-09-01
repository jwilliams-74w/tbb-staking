// withdraw_surplus tests:
// 1. attacker (non-authority) cannot withdraw
// 2. authority cannot withdraw MORE than surplus (promised interest protected)
// 3. authority CAN withdraw exact surplus amounts; balances move correctly
// 4. zero-amount withdraw rejected
// 5. after withdrawing, promised interest still fully covered
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { homedir } from 'os';

const RPC = 'http://127.0.0.1:8899';
const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');
const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const TBB_MINT = new PublicKey(envFile.match(/NEXT_PUBLIC_TBB_MINT=(\S+)/)[1]);
const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const conn = new Connection(RPC, 'confirmed');
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));
const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID);
const [treasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
const payerAta = getAssociatedTokenAddressSync(TBB_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

let pass = 0, fail = 0;
const rec = (name, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${name}${d ? ' — ' + d : ''}`); };

const wsIx = (auth, ata, amount) => {
  const data = Buffer.alloc(16);
  Buffer.from(disc('withdraw_surplus')).copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: auth, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: TBB_MINT, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
};

const expectFail = async (name, tx, signers, want) => {
  try {
    await sendAndConfirmTransaction(conn, tx, signers);
    rec(name, false, 'SUCCEEDED but should have been rejected!');
  } catch (e) {
    const ok = want ? (e.message || '').includes(want) : true;
    rec(name, ok, ok ? `rejected (${want || 'any error'})` : `wrong error: ${(e.message || '').slice(0, 120)}`);
  }
};

const treBal = async () => BigInt((await conn.getTokenAccountBalance(treasury)).value.amount);
const myBal = async () => BigInt((await conn.getTokenAccountBalance(payerAta)).value.amount);
const promised = async () => (await conn.getAccountInfo(pool)).data.readBigUInt64LE(8 + 32 + 32 + 32 + 8);

const t0 = await treBal(), p0 = await promised();
console.log(`Treasury: ${Number(t0) / 1e6} TBB | promised: ${Number(p0) / 1e6} TBB | surplus: ${Number(t0 - p0) / 1e6} TBB\n`);

// 1. attacker
const attacker = Keypair.generate();
await sendAndConfirmTransaction(conn, new Transaction().add(
  SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: attacker.publicKey, lamports: LAMPORTS_PER_SOL })), [payer]);
const attAta = getAssociatedTokenAddressSync(TBB_MINT, attacker.publicKey, false, TOKEN_2022_PROGRAM_ID);
await sendAndConfirmTransaction(conn, new Transaction().add(
  createAssociatedTokenAccountInstruction(payer.publicKey, attAta, attacker.publicKey, TBB_MINT, TOKEN_2022_PROGRAM_ID)), [payer]);
await expectFail('1. Attacker cannot withdraw surplus', new Transaction().add(wsIx(attacker.publicKey, attAta, 1_000_000n)), [attacker], '');

// 2. authority, more than surplus
const surplus = (await treBal()) - (await promised());
await expectFail('2. Withdraw > surplus rejected (promised interest protected)', new Transaction().add(wsIx(payer.publicKey, payerAta, surplus + 1n)), [payer], 'InsufficientSurplus');

// 3. zero amount
await expectFail('3. Zero-amount withdraw rejected', new Transaction().add(wsIx(payer.publicKey, payerAta, 0n)), [payer], 'ZeroAmount');

// 4. legit withdraw of 1M TBB
const amt = 1_000_000n * 1_000_000n;
const [tb, mb] = [await treBal(), await myBal()];
await sendAndConfirmTransaction(conn, new Transaction().add(wsIx(payer.publicKey, payerAta, amt)), [payer]);
const [ta, ma] = [await treBal(), await myBal()];
rec('4. Authority withdrew 1M TBB surplus', tb - ta === amt && ma - mb === amt, `treasury -${Number(tb - ta) / 1e6}, wallet +${Number(ma - mb) / 1e6}`);

// 5. promised interest still fully covered
const [t1, p1] = [await treBal(), await promised()];
rec('5. Promised interest still fully covered', t1 >= p1, `treasury ${Number(t1) / 1e6} >= promised ${Number(p1) / 1e6}`);

// 6. put it back (keep localnet fat for demos)
const fdata = Buffer.alloc(16);
Buffer.from(disc('fund_treasury')).copy(fdata, 0);
fdata.writeBigUInt64LE(amt, 8);
await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: false },
    { pubkey: TBB_MINT, isSigner: false, isWritable: false },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: payerAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data: fdata,
})), [payer]);
rec('6. Re-funded treasury (round trip)', (await treBal()) === t0, `back to ${Number(await treBal()) / 1e6} TBB`);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
