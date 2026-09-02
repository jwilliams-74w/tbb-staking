'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { StakingInterface } from '@/components/StakingInterface';
import { UserDashboard } from '@/components/UserDashboard';
import { FaucetButton } from '@/components/FaucetButton';

export default function Home() {
  const { connected } = useWallet();
  const [refreshKey, setRefreshKey] = useState(0);
  // Wallet button must render client-side only (its content depends on the
  // browser's wallet extension state → SSR/client mismatch = hydration error).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <main className="min-h-screen bg-tbb-dark">
      {/* Header */}
      <header className="border-b border-tbb-dark-border">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold text-tbb-orange">₿</div>
            <div>
              <h1 className="text-2xl font-bold text-white">TBB Staking</h1>
              <p className="text-sm text-gray-400">The Bitcoin Bull</p>
            </div>
          </div>
          {mounted ? <WalletMultiButton /> : <div style={{ width: 150, height: 48 }} />}
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-5xl font-bold text-white mb-6">
            Stake TBB. Earn Rewards.
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Lock your TBB tokens and earn up to <span className="text-tbb-orange font-semibold">18% APR</span>
          </p>
          
          {/* Tier Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
            {[
              { duration: '1 Month', apr: '5%', color: 'from-orange-500/20' },
              { duration: '3 Months', apr: '8%', color: 'from-orange-500/30' },
              { duration: '6 Months', apr: '12%', color: 'from-orange-500/40' },
              { duration: '12 Months', apr: '18%', color: 'from-orange-500/50' },
            ].map((tier, i) => (
              <div
                key={i}
                className={`card bg-gradient-to-br ${tier.color} to-transparent hover:scale-105 transition-transform`}
              >
                <div className="text-sm text-gray-400 mb-2">{tier.duration}</div>
                <div className="text-3xl font-bold text-tbb-orange">{tier.apr}</div>
                <div className="text-xs text-gray-500 mt-1">APR</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-16">
        <div className="max-w-7xl mx-auto px-4">
          {connected ? (
            <>
              <FaucetButton onFunded={() => setRefreshKey(k => k + 1)} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <StakingInterface key={refreshKey} onStaked={() => setRefreshKey(k => k + 1)} />
                <UserDashboard refreshKey={refreshKey} />
              </div>
            </>
          ) : (
            <div className="card max-w-md mx-auto text-center">
              <h3 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h3>
              <p className="text-gray-400 mb-6">
                Connect your Solana wallet to start staking TBB tokens
              </p>
              {mounted && <WalletMultiButton />}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-tbb-dark-border py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>TBB Token: <code className="text-tbb-orange">42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump</code></p>
          <p className="mt-2">Built by <span className="text-tbb-orange">@GoingParabolic</span> • Secured by Solana</p>
        </div>
      </footer>
    </main>
  );
}
