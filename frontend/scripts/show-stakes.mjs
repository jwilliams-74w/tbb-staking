import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('http://127.0.0.1:8899', 'confirmed');
const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');
const staker = new PublicKey(process.argv[2]);
const accounts = await conn.getProgramAccounts(PROGRAM_ID, { filters: [
  { dataSize: 8+32+32+8+1+2+8+8+8+8+1 },
  { memcmp: { offset: 8, bytes: staker.toBase58() } },
]});
console.log(`${accounts.length} stake(s) for ${staker.toBase58().slice(0,8)}…`);
for (const {pubkey, account} of accounts) {
  const d = account.data; let o = 8+32+32;
  const amt = Number(d.readBigUInt64LE(o))/1e6; o+=8;
  const tier = d.readUInt8(o); o+=1;
  const apr = d.readUInt16LE(o); o+=2;
  const start = Number(d.readBigInt64LE(o)); o+=8;
  const unlock = Number(d.readBigInt64LE(o)); o+=8;
  const interest = Number(d.readBigUInt64LE(o))/1e6;
  console.log('—', pubkey.toBase58().slice(0,12)+'…');
  console.log('  Amount:', amt.toLocaleString(), 'TBB | tier', tier, '@', apr/100+'% APR');
  console.log('  Unlock:', new Date(unlock*1000).toLocaleString());
  console.log('  Interest at maturity:', interest, 'TBB');
}
