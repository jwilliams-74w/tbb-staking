// Devnet faucet: sends test TBB (+ a splash of SOL for fees) to a requesting wallet.
// POST { wallet: string }  ->  { ok, sig?, error? }
// Signer comes from FAUCET_KEYPAIR env var (JSON array) — devnet play money only.
import { NextRequest, NextResponse } from 'next/server';
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction, createTransferCheckedInstruction,
} from '@solana/spl-token';

const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
const MINT = new PublicKey(process.env.NEXT_PUBLIC_TBB_MINT!);
const DRIP_TBB = 10_000n * 1_000_000n;      // 10,000 test TBB
const DRIP_SOL = 0.05 * LAMPORTS_PER_SOL;   // fee money
const MAX_EXISTING_TBB = 5_000n * 1_000_000n; // skip wallets already funded

export async function POST(req: NextRequest) {
  try {
    if (!process.env.FAUCET_KEYPAIR) {
      return NextResponse.json({ ok: false, error: 'Faucet not configured' }, { status: 500 });
    }
    const { wallet } = await req.json();
    let target: PublicKey;
    try {
      target = new PublicKey(wallet);
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid wallet address' }, { status: 400 });
    }

    const conn = new Connection(RPC, 'confirmed');
    const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.FAUCET_KEYPAIR)));
    const toAta = getAssociatedTokenAddressSync(MINT, target, false, TOKEN_2022_PROGRAM_ID);

    // Anti-drain: refuse wallets that already hold plenty of test TBB.
    const existing = await conn.getTokenAccountBalance(toAta).catch(() => null);
    if (existing && BigInt(existing.value.amount) >= MAX_EXISTING_TBB) {
      return NextResponse.json({ ok: false, error: 'Wallet already has test TBB — go stake it! 🐂' }, { status: 429 });
    }

    const fromAta = getAssociatedTokenAddressSync(MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction();

    // SOL for fees, only if they're low
    const solBal = await conn.getBalance(target);
    if (solBal < 0.02 * LAMPORTS_PER_SOL) {
      tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: target, lamports: DRIP_SOL }));
    }
    if (!existing) {
      tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, toAta, target, MINT, TOKEN_2022_PROGRAM_ID));
    }
    tx.add(createTransferCheckedInstruction(fromAta, MINT, toAta, payer.publicKey, DRIP_TBB, 6, [], TOKEN_2022_PROGRAM_ID));

    const sig = await sendAndConfirmTransaction(conn, tx, [payer]);
    return NextResponse.json({ ok: true, sig, amount: '10000' });
  } catch (e: any) {
    console.error('faucet error:', e);
    return NextResponse.json({ ok: false, error: e.message?.slice(0, 140) || 'Faucet failed' }, { status: 500 });
  }
}
