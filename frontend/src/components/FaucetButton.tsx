'use client';

import { FC, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export const FaucetButton: FC<{ onFunded?: () => void }> = ({ onFunded }) => {
  const { publicKey } = useWallet();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const request = async () => {
    if (!publicKey || state === 'loading') return;
    setState('loading');
    setMsg('');
    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (data.ok) {
        setState('done');
        setMsg('10,000 test TBB sent! 🐂');
        onFunded?.();
      } else {
        setState('error');
        setMsg(data.error || 'Faucet failed');
      }
    } catch {
      setState('error');
      setMsg('Network error — try again');
    }
  };

  if (!publicKey) return null;

  return (
    <div className="text-center mb-6">
      <button
        onClick={request}
        disabled={state === 'loading' || state === 'done'}
        className={`px-6 py-3 rounded-lg font-semibold transition-all ${
          state === 'done'
            ? 'bg-green-700 text-white cursor-default'
            : 'bg-tbb-orange hover:bg-orange-500 text-black'
        }`}
      >
        {state === 'loading' ? 'Sending…' : state === 'done' ? '✓ Test TBB received' : '🚰 Get 10,000 Test TBB (free)'}
      </button>
      {msg && (
        <p className={`text-sm mt-2 ${state === 'error' ? 'text-red-400' : 'text-green-400'}`}>{msg}</p>
      )}
      <p className="text-xs text-gray-500 mt-1">Devnet test tokens — no real value, just for trying the staking flow</p>
    </div>
  );
};
