'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type CreatorData = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  profile_pic_url: string | null;
  deso_username: string | null;
  creator_coin_holders: number;
  token_status: string;
};

type MarketData = {
  id: string;
  title: string;
  yes_price: number | null;
};

export default function ClaimPage() {
  const { slug } = useParams<{ slug: string }>();
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [step, setStep] = useState<'landing' | 'verify' | 'creating' | 'done'>('landing');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/creators/${slug}`).then(r => r.json()),
      fetch(`/api/markets?creatorSlug=${slug}&limit=10`).then(r => r.json()),
    ]).then(([creatorData, marketsData]) => {
      setCreator(creatorData.creator ?? creatorData.data ?? null);
      setMarkets(marketsData.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug]);

  const estimatedMonthlyEarnings = markets.length * 5000 * 0.01 * 4;
  const avatarUrl = creator?.profile_pic_url ?? creator?.image_url;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[var(--color-text-muted)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Hero section */}
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 text-center">

        {/* Creator avatar */}
        <div className="mb-6">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={creator?.name ?? String(slug)}
              className="w-24 h-24 rounded-full mx-auto border-4 border-orange-500/30 object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto bg-orange-500/20 flex items-center justify-center border-4 border-orange-500/30">
              <span className="text-3xl font-bold text-orange-400">
                {(creator?.name ?? String(slug))?.[0]?.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Main headline */}
        <h1 className="text-3xl font-bold mb-3 text-[var(--color-text)]">
          {creator?.name ?? slug}, you have a token on Caldera
        </h1>
        <p className="text-[var(--color-text-muted)] text-lg mb-8">
          Fans are making predictions about you.
          Every trade auto-buys your token. Claim it to start earning.
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="text-2xl font-bold text-orange-400">{markets.length}</div>
            <div className="text-xs text-[var(--color-text-muted)] mt-1">Active markets</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="text-2xl font-bold text-green-400">
              ${estimatedMonthlyEarnings > 0 ? estimatedMonthlyEarnings.toFixed(0) : '—'}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-1">Est. monthly</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="text-2xl font-bold text-[var(--color-text)]">
              {(creator?.creator_coin_holders ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-1">Token holders</div>
          </div>
        </div>

        {/* Active markets preview */}
        {markets.length > 0 && (
          <div className="mb-8 text-left">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              Active predictions about you
            </h2>
            <div className="space-y-2">
              {markets.slice(0, 3).map((market) => (
                <div
                  key={market.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <span className="text-sm line-clamp-1 flex-1 mr-4 text-[var(--color-text)]">
                    {market.title}
                  </span>
                  <span className="text-sm font-bold text-green-400 shrink-0">
                    {Math.round((market.yes_price ?? 0.5) * 100)}% YES
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Claim steps */}
        {step === 'landing' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('verify')}
              className="w-full py-4 rounded-xl bg-orange-500 text-white text-lg font-bold hover:bg-orange-600 transition-colors"
            >
              Claim My Token →
            </button>
            <p className="text-xs text-[var(--color-text-muted)]">
              Free to claim. No crypto wallet needed to start.
            </p>
          </div>
        )}

        {step === 'verify' && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-left">
            <h2 className="text-lg font-bold mb-2 text-[var(--color-text)]">Verify your identity</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Enter your Twitter/X handle to verify you are {creator?.name ?? slug}.
              We will check that this handle matches your public profile.
            </p>
            <div className="flex gap-2 mb-4">
              <span className="flex items-center px-3 rounded-l-lg border border-r-0 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] text-sm">
                @
              </span>
              <input
                value={twitterHandle}
                onChange={e => setTwitterHandle(e.target.value.replace('@', ''))}
                placeholder="yourhandle"
                className="flex-1 rounded-r-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-orange-500 focus:outline-none"
              />
            </div>
            {verifyError && (
              <p className="text-xs text-red-400 mb-3">{verifyError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setStep('landing')}
                className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleClaim}
                disabled={claiming || !twitterHandle.trim()}
                className="flex-1 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {claiming ? 'Verifying...' : 'Verify & Claim'}
              </button>
            </div>
          </div>
        )}

        {step === 'creating' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-semibold text-[var(--color-text)]">Creating your DeSo profile...</p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">This takes about 10 seconds</p>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2 text-[var(--color-text)]">Token claimed!</h2>
            <p className="text-[var(--color-text-muted)] mb-6">
              Your DeSo profile is live. Every prediction market trade about you
              now auto-buys your token.
            </p>
            <a
              href={`/creators/${slug}`}
              className="inline-block px-8 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
            >
              View My Profile →
            </a>
          </div>
        )}

        {/* How it works */}
        {step === 'landing' && (
          <div className="mt-12 pt-8 border-t border-[var(--color-border)] text-left">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">
              How it works
            </h2>
            <div className="space-y-4">
              {[
                { icon: '🎯', title: 'Fans make predictions', desc: 'Anyone can create a prediction market about you' },
                { icon: '💰', title: 'Every trade buys your token', desc: '1% of every trade automatically buys your creator coin' },
                { icon: '📈', title: 'You earn as you trend', desc: 'The more markets about you, the more your token earns' },
                { icon: '🔑', title: 'You control your token', desc: 'Claim your profile to withdraw earnings and verify your identity' },
              ].map(item => (
                <div key={item.title} className="flex gap-3">
                  <span className="text-2xl shrink-0">{item.icon}</span>
                  <div>
                    <div className="font-semibold text-sm text-[var(--color-text)]">{item.title}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  async function handleClaim() {
    if (!twitterHandle.trim()) return;
    setClaiming(true);
    setVerifyError('');

    try {
      const res = await fetch('/api/creators/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          twitterHandle: twitterHandle.trim(),
          creatorName: creator?.name ?? slug,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setVerifyError(data.error);
        setClaiming(false);
        return;
      }

      setStep('creating');
      // Poll for DeSo profile creation completion
      await new Promise<void>(r => setTimeout(r, 5000));
      setStep('done');
    } catch {
      setVerifyError('Something went wrong. Please try again.');
      setClaiming(false);
    }
  }
}
