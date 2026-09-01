'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { TIERS, TBB_MINT, buildStakeTx, computeInterest } from '@/lib/staking';

export const StakingInterface: FC<{ onStaked?: () => void }> = ({ onStaked }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState('');
  const [selectedTier, setSelectedTier] = useState(0);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const loadBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const ata = getAssociatedTokenAddressSync(TBB_MINT, publicKey, false, TOKEN_2022_PROGRAM_ID);
      const account = await connection.getTokenAccountBalance(ata);
      setBalance(parseFloat(account.value.uiAmountString || '0'));
    } catch {
      setBalance(0);
    }
  }, [publicKey, connection]);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const estimatedReward = amount && !isNaN(parseFloat(amount))
    ? computeInterest(parseFloat(amount), TIERS[selectedTier].aprBps, TIERS[selectedTier].seconds)
    : 0;

  const handleStake = async () => {
    if (!publicKey || !amount || isNaN(parseFloat(amount))) return;
    setLoading(true);
    setStatus(null);
    try {
      const tx = await buildStakeTx(connection, publicKey, parseFloat(amount), selectedTier);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');
      setStatus({ kind: 'ok', msg: `Staked! Tx: ${sig.slice(0, 8)}…${sig.slice(-8)}` });
      setAmount('');
      await loadBalance();
      onStaked?.();
    } catch (error: any) {
      console.error('Staking failed:', error);
      setStatus({ kind: 'err', msg: error.message?.slice(0, 140) || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-2xl font-bold text-white mb-6">Stake Your TBB</h3>

      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-2">
          Amount to Stake
          {balance !== null && (
            <span className="float-right text-xs">Balance: {balance.toLocaleString()} TBB</span>
          )}
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input w-full pr-16"
            min="0"
            step="0.01"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">TBB</div>
        </div>
        <button
          onClick={() => balance && setAmount(String(balance))}
          className="text-xs text-tbb-orange mt-2 hover:underline"
        >
          Max
        </button>
      </div>

      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-3">Lock Duration</label>
        <div className="grid grid-cols-2 gap-3">
          {TIERS.map((tier, i) => (
            <button
              key={i}
              onClick={() => setSelectedTier(i)}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedTier === i
                  ? 'border-tbb-orange bg-tbb-orange/10'
                  : 'border-tbb-dark-border hover:border-tbb-orange/50'
              }`}
            >
              <div className="text-white font-semibold">{tier.name}</div>
              <div className="text-tbb-orange text-lg font-bold">{tier.aprBps / 100}%</div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-tbb-dark rounded-lg p-4 mb-6 border border-tbb-dark-border">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-400 text-sm">Estimated Reward</span>
          <span className="text-white font-mono text-lg">+{estimatedReward.toFixed(2)} TBB</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Total at Unlock</span>
          <span className="text-tbb-orange font-mono text-lg font-bold">
            {(parseFloat(amount || '0') + estimatedReward).toFixed(2)} TBB
          </span>
        </div>
      </div>

      {status && (
        <div className={`rounded-lg p-3 mb-4 text-sm font-mono ${status.kind === 'ok' ? 'bg-green-900/30 text-green-400 border border-green-700' : 'bg-red-900/30 text-red-400 border border-red-700'}`}>
          {status.msg}
        </div>
      )}

      <button onClick={handleStake} disabled={!amount || loading || !publicKey} className="btn-primary w-full">
        {loading ? 'Confirming…' : 'Stake TBB'}
      </button>

      <p className="text-xs text-gray-500 text-center mt-4">
        {TIERS[selectedTier].days > 0 ? `Locked for ${TIERS[selectedTier].days} days` : 'Locked for 2 minutes (demo)'} • Principal secured in an on-chain vault
      </p>
    </div>
  );
};
