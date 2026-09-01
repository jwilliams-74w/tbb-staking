#!/usr/bin/env ts-node
/**
 * Treasury Funding Script
 * 
 * Run this as dev to deposit TBB into the staking treasury.
 * The treasury must have enough to cover all promised interest.
 * 
 * Usage:
 *   ts-node scripts/fund-treasury.ts --amount 1000000
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PROGRAM_ID, TBB_MINT, getPoolPDA, getTreasuryPDA } from '../src/lib/constants';
// import idl from '../src/lib/idl.json'; // Export after `anchor build`

const DEVNET_RPC = 'https://api.devnet.solana.com';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

async function main() {
  const args = process.argv.slice(2);
  const amountArg = args[args.indexOf('--amount') + 1];
  const cluster = args.includes('--mainnet') ? 'mainnet' : 'devnet';
  
  if (!amountArg) {
    console.error('Usage: ts-node fund-treasury.ts --amount <TBB_amount> [--mainnet]');
    process.exit(1);
  }

  const amount = parseFloat(amountArg);
  if (isNaN(amount) || amount <= 0) {
    console.error('Amount must be a positive number');
    process.exit(1);
  }

  const rpcUrl = cluster === 'mainnet' ? MAINNET_RPC : DEVNET_RPC;
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your wallet keypair (the dev/authority wallet)
  // In production, use a hardware wallet or secure key management
  const keypairPath = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
  const keypairData = require(keypairPath);
  const wallet = new Wallet(Keypair.fromSecretKey(new Uint8Array(keypairData)));

  console.log(`Funding treasury on ${cluster}...`);
  console.log(`Authority: ${wallet.publicKey.toBase58()}`);
  console.log(`Amount: ${amount} TBB\n`);

  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  // const program = new Program(idl as any, PROGRAM_ID, provider);

  const poolPubkey = getPoolPDA();
  const treasuryPubkey = getTreasuryPDA();
  const funderAta = await getAssociatedTokenAddress(
    TBB_MINT,
    wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  // Check current treasury balance
  const treasuryAccount = await connection.getTokenAccountBalance(treasuryPubkey);
  console.log(`Current treasury balance: ${treasuryAccount.value.uiAmountString} TBB`);

  // TODO: Uncomment once IDL is available
  /*
  const amountLamports = new BN(Math.floor(amount * 1e6));
  
  const tx = await program.methods
    .fundTreasury(amountLamports)
    .accounts({
      authority: wallet.publicKey,
      pool: poolPubkey,
      mint: TBB_MINT,
      treasury: treasuryPubkey,
      funderAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();

  console.log('\n✅ Treasury funded!');
  console.log(`Tx: https://explorer.solana.com/tx/${tx}?cluster=${cluster}`);

  // Verify new balance
  const newBalance = await connection.getTokenAccountBalance(treasuryPubkey);
  console.log(`New treasury balance: ${newBalance.value.uiAmountString} TBB`);
  */

  console.log('\n📝 TODO: Uncomment the transaction code after exporting the IDL.');
  console.log('   Run: anchor build && cp target/idl/tbb_staking.json frontend/src/lib/idl.json');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
