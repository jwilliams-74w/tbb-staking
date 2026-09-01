// Fund Jason's Phantom on DEVNET: 1 SOL + 1M test TBB from the deploy wallet.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createTransferCheckedInstruction } from '@solana/spl-token';
import { readFileSync } from 'fs';
import { homedir } from 'os';

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const TBB_MINT = new PublicKey(envFile.match(/NEXT_PUBLIC_TBB_MINT=(\S+)/)[1]);
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));
const target = new PublicKey('XQnMgnRjtPTHrXiiSt3Ek9c62YZsuDfY2XE3ajPKmrw'); // Jason's Phantom

await sendAndConfirmTransaction(conn, new Transaction().add(
  SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: target, lamports: 1 * LAMPORTS_PER_SOL })), [payer]);
console.log('Sent 1 devnet SOL');

const fromAta = getAssociatedTokenAddressSync(TBB_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
const toAta = getAssociatedTokenAddressSync(TBB_MINT, target, false, TOKEN_2022_PROGRAM_ID);
const tx = new Transaction();
if (!(await conn.getAccountInfo(toAta))) {
  tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, toAta, target, TBB_MINT, TOKEN_2022_PROGRAM_ID));
}
tx.add(createTransferCheckedInstruction(fromAta, TBB_MINT, toAta, payer.publicKey, 1_000_000n * 1_000_000n, 6, [], TOKEN_2022_PROGRAM_ID));
await sendAndConfirmTransaction(conn, tx, [payer]);
const bal = await conn.getTokenAccountBalance(toAta);
console.log(`Sent 1,000,000 test TBB — Phantom devnet balance: ${bal.value.uiAmountString} TBB`);
