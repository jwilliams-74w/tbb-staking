// List unique staker wallets on localnet, then check each one's SOL balance on devnet + localnet.
import { Connection, PublicKey } from '@solana/web3.js';
const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');
const local = new Connection('http://127.0.0.1:8899', 'confirmed');
const devnet = new Connection('https://api.devnet.solana.com', 'confirmed');

const accs = await local.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 8+32+32+8+1+2+8+8+8+8+1 }] });
const stakers = new Set();
for (const { account } of accs) stakers.add(new PublicKey(account.data.subarray(8, 40)).toBase58());

for (const s of stakers) {
  const pk = new PublicKey(s);
  const [l, d] = await Promise.all([
    local.getBalance(pk).catch(() => null),
    devnet.getBalance(pk).catch(() => null),
  ]);
  console.log(`${s}\n  localnet: ${l === null ? 'n/a' : l / 1e9} SOL | devnet: ${d === null ? 'n/a' : d / 1e9} SOL`);
}
