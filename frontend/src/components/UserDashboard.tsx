'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import Countdown from 'react-countdown';
import { TIERS, buildUnstakeTx, fetchUserStakes, UserStake } from '@/lib/staking';

export const UserDashboard: FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [stakes, setStakes] = useState<UserStake[]>([]);
  const [loading, setLoading] = useState(true);
  const [unstaking, setUnstaking] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadStakes = useCallback(async () => {
    if (!publicKey) { setStakes([]); setLoading(false); return; }
    setLoading(true);
    try {
      setStakes(await fetchUserStakes(connection, publicKey));
    } catch (e) {
      console.error('Failed to load stakes:', e);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => { loadStakes(); }, [loadStakes, refreshKey]);

  const handleUnstake = async (stake: UserStake) => {
    if (!publicKey || unstaking) return;
    setUnstaking(stake.address.toBase58());
    setStatus(null);
    try {
      const tx = await buildUnstakeTx(publicKey, stake.address);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      let sig: string;
      if (signTransaction) {
        const signed = await signTransaction(tx);
        sig = await connection.sendRawTransaction(signed.serialize());
      } else {
        sig = await sendTransaction(tx, connection);
      }
      await connection.confirmTransaction(sig, 'confirmed');
      setStatus(`Unstaked ${(stake.amount + stake.interest).toLocaleString()} TBB ✓`);
      await loadStakes();
    } catch (error: any) {
      console.error('Unstake failed:', error);
      setStatus(`Unstake failed: ${error.message?.slice(0, 120)}`);
    } finally {
      setUnstaking(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-tbb-dark-border rounded w-1/3"></div>
          <div className="h-32 bg-tbb-dark-border rounded"></div>
        </div>
      </div>
    );
  }

  if (stakes.length === 0) {
    return (
      <div className="card text-center">
        <div className="text-gray-500 py-12">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Active Stakes</h3>
          <p className="text-sm">Stake TBB to start earning rewards</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-2xl font-bold text-white mb-6">Your Stakes</h3>
      {status && (
        <div className="rounded-lg p-3 mb-4 text-sm font-mono bg-tbb-dark border border-tbb-dark-border text-tbb-orange">{status}</div>
      )}

      <div className="space-y-4">
        {stakes.map((stake) => {
          const tier = TIERS[stake.tier];
          const isUnlocked = stake.unlockTs <= Date.now();
          const key = stake.address.toBase58();

          return (
            <div key={key} className="bg-tbb-dark rounded-lg p-5 border border-tbb-dark-border">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-sm text-gray-400">Staked Amount</div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {stake.amount.toLocaleString()} TBB
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Lock Period</div>
                  <div className="text-sm font-semibold text-tbb-orange">{tier.name}</div>
                  <div className="text-xs text-gray-500">{tier.aprBps / 100}% APR</div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm text-gray-400 mb-2">{isUnlocked ? 'Unlocked!' : 'Unlocks in'}</div>
                <Countdown
                  date={stake.unlockTs}
                  renderer={({ days, hours, minutes, seconds, completed }) => {
                    if (completed) {
                      return (
                        <div className="text-green-500 font-semibold flex items-center gap-2">
                          <span className="text-2xl">✓</span>
                          <span>Ready to claim your rewards</span>
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { val: days, label: 'Days' },
                          { val: hours, label: 'Hours' },
                          { val: minutes, label: 'Mins' },
                          { val: seconds, label: 'Secs' },
                        ].map((unit, idx) => (
                          <div key={idx} className="bg-tbb-dark-card rounded p-2 text-center border border-tbb-dark-border">
                            <div className="text-xl font-bold text-tbb-orange font-mono">
                              {String(unit.val).padStart(2, '0')}
                            </div>
                            <div className="text-xs text-gray-500">{unit.label}</div>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-tbb-dark-border mb-2">
                <span className="text-sm text-gray-400">Interest (paid at unlock)</span>
                <span className="text-lg font-bold text-green-500 font-mono">
                  +{stake.interest.toLocaleString()} TBB
                </span>
              </div>

              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-400">Total at Unlock</span>
                <span className="text-xl font-bold text-white font-mono">
                  {(stake.amount + stake.interest).toLocaleString()} TBB
                </span>
              </div>

              <button
                onClick={() => handleUnstake(stake)}
                disabled={!isUnlocked || unstaking === key}
                className={`w-full py-3 rounded-lg font-semibold transition-all ${
                  isUnlocked
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-tbb-dark-border text-gray-500 cursor-not-allowed'
                }`}
              >
                {unstaking === key
                  ? 'Confirming…'
                  : isUnlocked
                  ? `Unstake & Claim ${(stake.amount + stake.interest).toLocaleString()} TBB`
                  : 'Locked'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
