// Hostile-mint initialization tests (audit #5/#6/#7/#8).
// MUST run against a FRESH validator with the program deployed but NO pool initialized.
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction, createInitializeMintInstruction,
  createMintToInstruction, getMintLen, ExtensionType,
  createInitializeTransferFeeConfigInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createInitializeMintCloseAuthorityInstruction,
} from '@solana/spl-token';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { homedir } from 'os';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8899';
const PROGRAM_ID = new PublicKey('GWdCWaDbCJfBNzND3K4f8JMRCcv16sWSSapmp8cf1Khk');
const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const conn = new Connection(RPC, 'confirmed');
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));

const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool')], PROGRAM_ID);
const [treasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const [programData] = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_LOADER_UPGRADEABLE);

let pass = 0, fail = 0;
const record = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (await conn.getAccountInfo(pool)) {
  console.error('Pool already initialized on this validator — run on a FRESH ledger.');
  process.exit(2);
}

async function makeMint(extensions, initExtIxs, freezeAuthority = null) {
  const kp = Keypair.generate();
  const len = getMintLen(extensions);
  const rent = await conn.getMinimumBalanceForRentExemption(len);
  const tx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: kp.publicKey, space: len, lamports: rent, programId: TOKEN_2022_PROGRAM_ID }),
    ...initExtIxs(kp.publicKey),
    createInitializeMintInstruction(kp.publicKey, 6, payer.publicKey, freezeAuthority, TOKEN_2022_PROGRAM_ID),
  );
  await sendAndConfirmTransaction(conn, tx, [payer, kp]);
  // fund an ATA so initialize_pool's funder_ata exists with balance
  const ata = getAssociatedTokenAddressSync(kp.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  await sendAndConfirmTransaction(conn, new Transaction().add(
    createAssociatedTokenAccountInstruction(payer.publicKey, ata, payer.publicKey, kp.publicKey, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(kp.publicKey, ata, payer.publicKey, 1_000_000_000n, [], TOKEN_2022_PROGRAM_ID),
  ), [payer]);
  return { mint: kp.publicKey, ata };
}

function initPoolIx(mint, funderAta) {
  const data = Buffer.alloc(16);
  disc('initialize_pool').copy(data, 0);
  data.writeBigUInt64LE(1_000_000n, 8);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: funderAta, isSigner: false, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: programData, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function expectInitReject(name, mintPromise, expectErr) {
  const { mint, ata } = await mintPromise;
  try {
    await sendAndConfirmTransaction(conn, new Transaction().add(initPoolIx(mint, ata)), [payer]);
    record(name, false, 'ACCEPTED — should have been rejected!');
  } catch (e) {
    const ok = expectErr ? e.message.includes(expectErr) : true;
    record(name, ok, ok ? `rejected (${expectErr})` : `wrong error: ${e.message.slice(0, 140)}`);
  }
}

console.log('=== HOSTILE MINT INIT TESTS (audit #5/#6/#7/#8) ===\n');

// #5: freeze authority
await expectInitReject('#5 Mint with freeze authority rejected',
  makeMint([], () => [], payer.publicKey), 'MintHasFreezeAuthority');

// #8: transfer fee
await expectInitReject('#8 Mint with TransferFeeConfig rejected',
  makeMint([ExtensionType.TransferFeeConfig], (m) => [
    createInitializeTransferFeeConfigInstruction(m, payer.publicKey, payer.publicKey, 100, 1_000_000n, TOKEN_2022_PROGRAM_ID)]),
  'ForbiddenMintExtension');

// #6: permanent delegate
await expectInitReject('#6 Mint with PermanentDelegate rejected',
  makeMint([ExtensionType.PermanentDelegate], (m) => [
    createInitializePermanentDelegateInstruction(m, payer.publicKey, TOKEN_2022_PROGRAM_ID)]),
  'ForbiddenMintExtension');

// #7: transfer hook
await expectInitReject('#7 Mint with TransferHook rejected',
  makeMint([ExtensionType.TransferHook], (m) => [
    createInitializeTransferHookInstruction(m, payer.publicKey, PublicKey.default, TOKEN_2022_PROGRAM_ID)]),
  'ForbiddenMintExtension');

// mint close authority (re-creation attack surface from #5/#6/#7 mitigations)
await expectInitReject('#5/#6/#7 Mint with MintCloseAuthority rejected',
  makeMint([ExtensionType.MintCloseAuthority], (m) => [
    createInitializeMintCloseAuthorityInstruction(m, payer.publicKey, TOKEN_2022_PROGRAM_ID)]),
  'ForbiddenMintExtension');

// clean mint accepted + treasury seeded in same ix
{
  const { mint, ata } = await makeMint([], () => []);
  try {
    await sendAndConfirmTransaction(conn, new Transaction().add(initPoolIx(mint, ata)), [payer]);
    const bal = BigInt((await conn.getTokenAccountBalance(treasury)).value.amount);
    record('Clean mint accepted; treasury seeded at init', bal === 1_000_000n, `treasury=${bal} (expected 1000000)`);
  } catch (e) {
    record('Clean mint accepted', false, e.message.slice(0, 140));
  }
}

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
