import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const sigs = await conn.getSignaturesForAddress(new PublicKey('GWdCWaDbCJfBNzND3K4f8JMRCcv16sWSSapmp8cf1Khk'), { limit: 30 });
for (const s of sigs) {
  const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  const logs = (tx?.meta?.logMessages || []).filter(l => /Instruction:/.test(l)).map(l => l.split('Instruction: ')[1]).join(',');
  const feePayer = tx?.transaction.message.staticAccountKeys?.[0]?.toBase58().slice(0, 8) || '?';
  console.log(new Date(s.blockTime * 1000).toISOString(), s.err ? 'ERR' : 'ok', feePayer, logs);
}
