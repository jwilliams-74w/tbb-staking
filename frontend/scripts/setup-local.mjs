// Local-validator setup: create test TBB mint, initialize pool, fund treasury.
// Run: node scripts/setup-local.mjs
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from '@solana/spl-token';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';

const RPC = 'http://127.0.0.1:8899';
const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');

const disc = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);

const conn = new Connection(RPC, 'confirmed');
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));
console.log('Authority:', payer.publicKey.toBase58());

// 1) Create test TBB mint (Token-2022, 6 decimals)
const mintKp = Keypair.generate();
const mintLen = getMintLen([]);
const rent = await conn.getMinimumBalanceForRentExemption(mintLen);
const ataAddr = getAssociatedTokenAddressSync(mintKp.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

const tx1 = new Transaction().add(
  SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mintKp.publicKey, space: mintLen, lamports: rent, programId: TOKEN_2022_PROGRAM_ID }),
  createInitializeMintInstruction(mintKp.publicKey, 6, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
  createAssociatedTokenAccountInstruction(payer.publicKey, ataAddr, payer.publicKey, mintKp.publicKey, TOKEN_2022_PROGRAM_ID),
  createMintToInstruction(mintKp.publicKey, ataAddr, payer.publicKey, 100_000_000n * 1_000_000n, [], TOKEN_2022_PROGRAM_ID), // 100M TBB
);
await sendAndConfirmTransaction(conn, tx1, [payer, mintKp]);
console.log('Test TBB mint:', mintKp.publicKey.toBase58());
console.log('Dev ATA (100M TBB):', ataAddr.toBase58());

// 2) Initialize pool
const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID);
const [treasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);

const initIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: mintKp.publicKey, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: disc('initialize_pool'),
});
await sendAndConfirmTransaction(conn, new Transaction().add(initIx), [payer]);
console.log('Pool initialized:', pool.toBase58());
console.log('Treasury:', treasury.toBase58());

// 3) Fund treasury with 10M TBB (covers plenty of promised interest)
const amount = 10_000_000n * 1_000_000n;
const data = Buffer.concat([disc('fund_treasury'), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(amount); return b; })()]);
const fundIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: false },
    { pubkey: mintKp.publicKey, isSigner: false, isWritable: false },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: ataAddr, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data,
});
await sendAndConfirmTransaction(conn, new Transaction().add(fundIx), [payer]);
const bal = await conn.getTokenAccountBalance(treasury);
console.log('Treasury funded:', bal.value.uiAmountString, 'TBB');

// 4) Write frontend env
writeFileSync(new URL('../.env.local', import.meta.url), `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899\nNEXT_PUBLIC_TBB_MINT=${mintKp.publicKey.toBase58()}\n`);
console.log('\n.env.local written — restart the dev server to pick it up.');
console.log('DONE');
