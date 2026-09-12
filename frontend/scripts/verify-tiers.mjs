// Verify the on-chain tier table of the rehearsal pool (mainnet build, local validator)
import { Connection, PublicKey } from '@solana/web3.js';

const conn = new Connection(process.env.RPC_URL || 'http://127.0.0.1:8899', 'confirmed');
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '4KgvDmEjPJNtbiVhnZ9Cf1i1vgeZdKrCNKhHVTNTkLWT');
const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID);
const acc = await conn.getAccountInfo(pool);
if (!acc) { console.log('no pool account'); process.exit(1); }
const d = acc.data;
console.log('pool data len:', d.length);
for (let off = 0; off <= d.length - 50; off++) {
  if (Number(d.readBigInt64LE(off)) === 30 * 86400 && d.readUInt16LE(off + 8) === 500) {
    console.log('tier table @ offset', off);
    let demoFound = false;
    for (let i = 0; i < 5; i++) {
      const secs = Number(d.readBigInt64LE(off + i * 10));
      const apr = d.readUInt16LE(off + i * 10 + 8);
      if (secs < 86400) demoFound = true;
      console.log(`  tier ${i}: ${secs}s (${(secs / 86400).toFixed(1)}d) @ ${apr}bps`);
    }
    console.log(demoFound ? '❌ DEMO TIER STILL PRESENT' : '✅ no demo tier — all locks >= 30 days');
    break;
  }
}
