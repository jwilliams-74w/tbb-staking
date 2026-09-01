// Inspect all DEVNET stakes: owner, tier, amounts, timestamps vs chain clock.
import { Connection, PublicKey } from '@solana/web3.js';
const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

function parseStake(d) {
  let o = 8;
  const staker = new PublicKey(d.subarray(o, o + 32)); o += 32 + 32;
  const amount = d.readBigUInt64LE(o); o += 8;
  const tier = d.readUInt8(o); o += 1;
  const aprBps = d.readUInt16LE(o); o += 2;
  const startTs = Number(d.readBigInt64LE(o)); o += 8;
  const unlockTs = Number(d.readBigInt64LE(o)); o += 8;
  const interest = d.readBigUInt64LE(o); o += 8;
  const stakeIndex = d.readBigUInt64LE(o);
  return { staker, amount, tier, aprBps, startTs, unlockTs, interest, stakeIndex };
}

const accs = await conn.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 8+32+32+8+1+2+8+8+8+8+1 }] });
const slot = await conn.getSlot();
const now = await conn.getBlockTime(slot);
console.log(`${accs.length} stake account(s) on devnet | chain time: ${new Date(now * 1000).toISOString()}\n`);
for (const { pubkey, account } of accs) {
  const s = parseStake(account.data);
  const remain = s.unlockTs - now;
  console.log(`#${s.stakeIndex} ${pubkey.toBase58().slice(0,8)}… staker ${s.staker.toBase58().slice(0,8)}…`);
  console.log(`  tier ${s.tier} @ ${s.aprBps}bps | ${Number(s.amount)/1e6} TBB | interest ${Number(s.interest)/1e6}`);
  console.log(`  start ${new Date(s.startTs*1000).toISOString()} unlock ${new Date(s.unlockTs*1000).toISOString()}`);
  console.log(`  ${remain > 0 ? remain + 's remaining' : 'UNLOCKED ' + (-remain) + 's ago'}\n`);
}
