// Prove the live faucet drips to a brand-new wallet, end to end.
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { readFileSync } from 'fs';

const fresh = Keypair.generate();
console.log('Fresh wallet:', fresh.publicKey.toBase58());
const res = await fetch('https://tbb-staking-going-parabolic.vercel.app/api/faucet', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wallet: fresh.publicKey.toBase58() }),
});
const data = await res.json();
console.log('Faucet response:', JSON.stringify(data));
if (!data.ok) process.exit(1);

const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const MINT = new PublicKey(envFile.match(/NEXT_PUBLIC_TBB_MINT=(\S+)/)[1]);
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const ata = getAssociatedTokenAddressSync(MINT, fresh.publicKey, false, TOKEN_2022_PROGRAM_ID);
const bal = await conn.getTokenAccountBalance(ata);
const sol = await conn.getBalance(fresh.publicKey);
console.log(`On-chain: ${bal.value.uiAmountString} TBB, ${sol / 1e9} SOL ✅`);
