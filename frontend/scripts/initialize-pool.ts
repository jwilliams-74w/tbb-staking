#!/usr/bin/env ts-node
/**
 * Initialize Pool Script
 * 
 * One-time setup: creates the pool config + treasury token account.
 * Run this once after deploying the program to devnet or mainnet.
 * 
 * Usage:
 *   ts-node scripts/initialize-pool.ts [--mainnet]
 */

import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PROGRAM_ID, TBB_MINT, getPoolPDA, getTreasuryPDA } from '../src/lib/constants';
// import idl from '../src/lib/idl.json';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

async function main() {
  const args = process.argv.slice(2);
  const cluster = args.includes('--mainnet') ? 'mainnet' : 'devnet';
  
  const rpcUrl = cluster === 'mainnet' ? MAINNET_RPC : DEVNET_RPC;
  const connection = new Connection(rpcUrl, 'confirmed');
  
  const keypairPath = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
  const keypairData = require(keypairPath);
  const wallet = new Wallet(Keypair.fromSecretKey(new Uint8Array(keypairData)));

  console.log(`Initializing pool on ${cluster}...`);
  console.log(`Authority: ${wallet.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`TBB Mint: ${TBB_MINT.toBase58()}\n`);

  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  // const program = new Program(idl as any, PROGRAM_ID, provider);

  const poolPubkey = getPoolPDA();
  const treasuryPubkey = getTreasuryPDA();

  // Check if already initialized
  try {
    const poolAccount = await connection.getAccountInfo(poolPubkey);
    if (poolAccount) {
      console.log('⚠️  Pool already initialized!');
      console.log(`Pool: ${poolPubkey.toBase58()}`);
      console.log(`Treasury: ${treasuryPubkey.toBase58()}`);
      return;
    }
  } catch {}

  // TODO: Uncomment once IDL is available
  /*
  const tx = await program.methods
    .initializePool()
    .accounts({
      authority: wallet.publicKey,
      mint: TBB_MINT,
      pool: poolPubkey,
      treasury: treasuryPubkey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log('✅ Pool initialized!');
  console.log(`Tx: https://explorer.solana.com/tx/${tx}?cluster=${cluster}`);
  console.log(`\nPool PDA: ${poolPubkey.toBase58()}`);
  console.log(`Treasury PDA: ${treasuryPubkey.toBase58()}`);
  console.log('\nNext step: Fund the treasury with TBB via fund-treasury.ts');
  */

  console.log('\n📝 TODO: Uncomment the transaction code after exporting the IDL.');
  console.log('   Run: anchor build && cp target/idl/tbb_staking.json frontend/src/lib/idl.json');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
