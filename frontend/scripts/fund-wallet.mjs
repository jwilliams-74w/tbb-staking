// Fund any wallet (e.g. your Phantom) with local SOL + test TBB.
// Usage: node scripts/fund-wallet.mjs <WALLET_ADDRESS> [TBB_AMOUNT]
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createTransferCheckedInstruction } from '@solana/spl-token';
import { readFileSync } from 'fs';
import { homedir } from 'os';

const RPC = 'http://127.0.0.1:8899';
const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const TBB_MINT = new PublicKey(envFile.match(/NEXT_PUBLIC_TBB_MINT=(\S+)/)[1]);

const target = new PublicKey(process.argv[2]);
const tbbAmount = BigInt(Math.floor(parseFloat(process.argv[3] || '1000000'))) * 1_000_000n;

const conn = new Connection(RPC, 'confirmed');
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));

// 1) SOL for gas
const solTx = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: target, lamports: 5 * LAMPORTS_PER_SOL }));
await sendAndConfirmTransaction(conn, solTx, [payer]);
console.log('Sent 5 SOL to', target.toBase58());

// 2) Test TBB
const fromAta = getAssociatedTokenAddressSync(TBB_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
const toAta = getAssociatedTokenAddressSync(TBB_MINT, target, false, TOKEN_2022_PROGRAM_ID);
const tx = new Transaction();
if (!(await conn.getAccountInfo(toAta))) {
  tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, toAta, target, TBB_MINT, TOKEN_2022_PROGRAM_ID));
}
tx.add(createTransferCheckedInstruction(fromAta, TBB_MINT, toAta, payer.publicKey, tbbAmount, 6, [], TOKEN_2022_PROGRAM_ID));
await sendAndConfirmTransaction(conn, tx, [payer]);
const bal = await conn.getTokenAccountBalance(toAta);
console.log(`Sent ${Number(tbbAmount) / 1e6} test TBB — recipient balance: ${bal.value.uiAmountString} TBB`);
console.log('DONE — connect Phantom (localhost network) and stake!');
