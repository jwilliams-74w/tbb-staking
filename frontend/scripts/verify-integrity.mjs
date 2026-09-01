// 1) Unstake any unlocked leftover stakes for the payer wallet.
// 2) Verify on-chain promised interest matches the off-chain formula for every tier.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
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
const ata = getAssociatedTokenAddressSync(TBB_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

const TIERS = [[30 * 86400, 500n], [90 * 86400, 800n], [180 * 86400, 1200n], [365 * 86400, 1800n], [120, 1800n]];
const calcInterest = (amt, bps, secs) => (amt * bps * BigInt(secs)) / 10_000n / 31_536_000n;

function parseStake(d) {
  let o = 8;
  const staker = new PublicKey(d.subarray(o, o + 32)); o += 32;
  o += 32; // pool
  const amount = d.readBigUInt64LE(o); o += 8;
  const tier = d.readUInt8(o); o += 1;
  const aprBps = d.readUInt16LE(o); o += 2;
  const startTs = Number(d.readBigInt64LE(o)); o += 8;
  const unlockTs = Number(d.readBigInt64LE(o)); o += 8;
  const interest = d.readBigUInt64LE(o); o += 8;
  const stakeIndex = d.readBigUInt64LE(o);
  return { staker, amount, tier, aprBps, startTs, unlockTs, interest, stakeIndex };
}

const accounts = await conn.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 8 + 32 + 32 + 8 + 1 + 2 + 8 + 8 + 8 + 8 + 1 }] });
const slot = await conn.getSlot();
const chainTime = await conn.getBlockTime(slot);
console.log(`Found ${accounts.length} stake accounts | chain time ${new Date(chainTime * 1000).toISOString()}\n`);

let mathPass = 0, mathFail = 0, cleaned = 0;
for (const { pubkey, account } of accounts) {
  const s = parseStake(account.data);
  const [lockSecs, bps] = TIERS[s.tier];
  const expected = calcInterest(s.amount, bps, lockSecs);
  const durOk = s.unlockTs - s.startTs === lockSecs;
  const intOk = expected === s.interest;
  const aprOk = BigInt(s.aprBps) === bps;
  (intOk && durOk && aprOk) ? mathPass++ : mathFail++;
  console.log(`${intOk && durOk && aprOk ? '✅' : '❌'} stake #${s.stakeIndex} tier ${s.tier}: ${Number(s.amount) / 1e6} TBB @ ${s.aprBps}bps, lock ${(s.unlockTs - s.startTs) / 86400}d`);
  console.log(`   on-chain interest ${Number(s.interest) / 1e6} vs formula ${Number(expected) / 1e6} ${intOk ? '(exact match)' : '(MISMATCH!)'}`);

  // Cleanup: unstake if unlocked, owned by payer, and it's a demo-tier remnant
  if (s.tier === 4 && chainTime >= s.unlockTs && s.staker.equals(payer.publicKey)) {
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), pubkey.toBuffer()], PROGRAM_ID);
    const keys = [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: TBB_MINT, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: pubkey, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    await sendAndConfirmTransaction(conn, new Transaction().add(
      new TransactionInstruction({ programId: PROGRAM_ID, keys, data: Buffer.from(disc('unstake')) })), [payer]);
    console.log(`   🧹 cleaned up (unstaked leftover demo stake)`);
    cleaned++;
  }
}

// Pool vs sum-of-stakes integrity (after cleanup)
const remaining = await conn.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 8 + 32 + 32 + 8 + 1 + 2 + 8 + 8 + 8 + 8 + 1 }] });
const sumAmt = remaining.reduce((a, { account }) => a + parseStake(account.data).amount, 0n);
const sumInt = remaining.reduce((a, { account }) => a + parseStake(account.data).interest, 0n);
const pd = (await conn.getAccountInfo(pool)).data;
const poolStaked = pd.readBigUInt64LE(8 + 32 + 32 + 32);
const poolPromised = pd.readBigUInt64LE(8 + 32 + 32 + 32 + 8);
const treBal = BigInt((await conn.getTokenAccountBalance(treasury)).value.amount);
const solvent = treBal >= poolPromised;
console.log(`\nPool.total_staked=${Number(poolStaked) / 1e6} vs Σ stake amounts=${Number(sumAmt) / 1e6} ${poolStaked === sumAmt ? '✅' : '❌'}`);
console.log(`Pool.total_promised=${Number(poolPromised) / 1e6} vs Σ stake interest=${Number(sumInt) / 1e6} ${poolPromised === sumInt ? '✅' : '❌'}`);
console.log(`Treasury ${Number(treBal) / 1e6} TBB covers promised ${Number(poolPromised) / 1e6} TBB ${solvent ? '✅ SOLVENT' : '❌ INSOLVENT'}`);
console.log(`\nInterest math: ${mathPass} exact, ${mathFail} mismatched | cleaned ${cleaned} leftover demo stakes`);
process.exit(mathFail > 0 || poolStaked !== sumAmt || poolPromised !== sumInt || !solvent ? 1 : 0);
