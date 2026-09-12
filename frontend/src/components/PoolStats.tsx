'use client';

import { FC, useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { fetchPoolStats } from '@/lib/staking';

/** Live "Total TBB Staked" strip — reads pool state on-chain, refreshes every 30s. */
export const PoolStats: FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const { connection } = useConnection();
  const [stats, setStats] = useState<{ totalStakedUi: number; totalStakes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await fetchPoolStats(connection);
        if (!cancelled) setStats(s);
      } catch { /* pool unreachable — keep last value */ }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection, refreshKey]);

  return (
    <div className="flex items-center justify-center gap-10 mb-10">
      <div className="text-center">
        <div className="text-4xl font-bold text-tbb-orange">
          {stats ? stats.totalStakedUi.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
        </div>
        <div className="text-sm text-gray-400 mt-1">Total TBB Staked</div>
      </div>
      <div className="text-center">
        <div className="text-4xl font-bold text-white">
          {stats ? stats.totalStakes.toLocaleString() : '—'}
        </div>
        <div className="text-sm text-gray-400 mt-1">Stakes Created</div>
      </div>
    </div>
  );
};
