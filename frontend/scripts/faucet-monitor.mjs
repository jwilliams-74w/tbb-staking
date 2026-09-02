// Faucet/testing activity monitor — minimal RPC footprint (2 calls), deterministic output.
// Signal 1: faucet wallet's remaining TBB (drops = claims happened).
// Signal 2: live stake accounts (who is actually staking).
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const MINT = new PublicKey('H4wtj4ou9YYcXPHkt8i95t6xWT8KQDugYk72CFyA4pJr');
const PROGRAM_ID = new PublicKey('4GgJezu4eVAWiCdS3Y4dBWDTNNAhQgDuke2ScwwWEcae');
const DEPLOY = new PublicKey('GsFnpyNUEny2L7KEfUiN8QtpU29eDJPEZuq3XMFH7yWv');
const JASON = 'XQnMgnRjtPTHrXiiSt3Ek9c62YZsuDfY2XE3ajPKmrw';

const faucetAta = getAssociatedTokenAddressSync(MINT, DEPLOY, false, TOKEN_2022_PROGRAM_ID);
const bal = await conn.getTokenAccountBalance(faucetAta);
// Faucet started with 90M after treasury funding + Jason's 1M. Claims = (start - current) / 10k.
const remaining = Number(bal.value.uiAmount);
const claims = Math.max(0, Math.round((89_000_000 - remaining) / 10_000));

const stakeAccs = await conn.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 8+32+32+8+1+2+8+8+8+8+1 }] });
const stakers = new Set();
let totalStaked = 0n;
for (const { account } of stakeAccs) {
  stakers.add(new PublicKey(account.data.subarray(8, 40)).toBase58());
  totalStaked += account.data.readBigUInt64LE(72);
}
const community = [...stakers].filter(s => s !== JASON);

console.log(`FAUCET_CLAIMS≈${claims}`);
console.log(`FAUCET_REMAINING_TBB=${remaining}`);
console.log(`LIVE_STAKES=${stakeAccs.length}`);
console.log(`UNIQUE_STAKERS=${stakers.size} (community: ${community.length})`);
console.log(`TOTAL_STAKED_TBB=${Number(totalStaked) / 1e6}`);
console.log(`STAKER_IDS=${[...stakers].map(s => s.slice(0, 8)).sort().join(',') || 'none'}`);
