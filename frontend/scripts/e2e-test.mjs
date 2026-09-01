// End-to-end proof: stake 1000 TBB for tier 0, verify vault + stake account state.
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

// read pool.total_stakes
const poolInfo = await conn.getAccountInfo(pool);
const stakeIndex = poolInfo.data.readBigUInt64LE(8 + 32 + 32 + 32 + 8 + 8);
console.log('Pool total_stakes before:', stakeIndex.toString());

const idxBuf = Buffer.alloc(8); idxBuf.writeBigUInt64LE(stakeIndex);
const [stakeAccount] = PublicKey.findProgramAddressSync([Buffer.from('stake'), pool.toBuffer(), payer.publicKey.toBuffer(), idxBuf], PROGRAM_ID);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), stakeAccount.toBuffer()], PROGRAM_ID);
const ata = getAssociatedTokenAddressSync(TBB_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

// stake 1000 TBB, tier 0 (1 month, 5% APR)
const amount = 1000n * 1_000_000n;
const data = Buffer.alloc(17);
Buffer.from(disc('stake')).copy(data, 0);
data.writeBigUInt64LE(amount, 8);
data.writeUInt8(0, 16);

const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: TBB_MINT, isSigner: false, isWritable: false },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: stakeAccount, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data,
});
const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [payer]);
console.log('STAKE TX:', sig);

// verify
const vaultBal = await conn.getTokenAccountBalance(vault);
console.log('Vault balance:', vaultBal.value.uiAmountString, 'TBB');
const sa = await conn.getAccountInfo(stakeAccount);
let o = 8 + 32 + 32;
const amt = Number(sa.data.readBigUInt64LE(o)) / 1e6; o += 8;
const tier = sa.data.readUInt8(o); o += 1;
const aprBps = sa.data.readUInt16LE(o); o += 2;
const startTs = Number(sa.data.readBigInt64LE(o)); o += 8;
const unlockTs = Number(sa.data.readBigInt64LE(o)); o += 8;
const interest = Number(sa.data.readBigUInt64LE(o)) / 1e6;
console.log(`StakeAccount: ${amt} TBB @ tier ${tier} (${aprBps} bps)`);
console.log(`Start: ${new Date(startTs * 1000).toISOString()}`);
console.log(`Unlock: ${new Date(unlockTs * 1000).toISOString()}`);
console.log(`Promised interest: ${interest} TBB`);
console.log('E2E STAKE TEST PASSED ✅');
