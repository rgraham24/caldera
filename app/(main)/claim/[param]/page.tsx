'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store';
import { connectDeSoWallet } from '@/lib/deso/auth';

// ─── helpers ────────────────────────────────────────────────────────────────

function isClaimCode(param: string): boolean {
  return /^CALDERA-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(param);
}

// ─── root ────────────────────────────────────────────────────────────────────

export default function ClaimPage() {
  const { param } = useParams<{ param: string }>();

  if (isClaimCode(param)) {
    return <ClaimCodePage code={param} />;
  }
  return <ClaimSlugPage slug={param} />;
}

// ─── ClaimCodePage (old flow: CALDERA-XXXX-XXXX) ────────────────────────────

type CodeCreator = {
  name: string;
  slug: string;
  deso_username: string | null;
  creator_coin_symbol: string | null;
  profile_pic_url: string | null;
  image_url: string | null;
};

const CODE_STEPS = [
  { n: 1, title: 'Copy your unique code' },
  { n: 2, title: 'Post it publicly on any social' },
  { n: 3, title: 'Connect your DeSo wallet' },
  { n: 4, title: 'Paste your post URL & claim' },
];

function ClaimCodePage({ code }: { code: string }) {
  const { isConnected, desoPublicKey } = useAppStore();

  const [creator, setCreator] = useState<CodeCreator | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetch(`/api/claim/code-info?code=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(data => {
        setCreator(data.creator ?? null);
        setAlreadyClaimed(data.alreadyClaimed ?? false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [code]);

  const sym = creator?.deso_username ?? creator?.creator_coin_symbol ?? creator?.slug ?? '';

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClaim = async () => {
    if (!desoPublicKey || !postUrl.trim()) return;
    setClaimLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/claim/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, desoPublicKey, socialPostUrl: postUrl.trim() }),
      });
      const { data, error: err } = await res.json();
      if (err) throw new Error(err);
      setSuccess(true);
      setSuccessMsg(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setClaimLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  if (alreadyClaimed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yes/10">
          <Check className="h-7 w-7 text-yes" />
        </div>
        <h1 className="font-display text-2xl font-bold text-text-primary mb-2">Already Claimed</h1>
        <p className="text-text-muted text-sm mb-6">This token has already been claimed by its owner.</p>
        {creator && (
          <Link
            href={`/creators/${creator.slug}`}
            className="rounded-xl bg-caldera px-6 py-2.5 text-sm font-semibold text-white"
          >
            View ${sym} →
          </Link>
        )}
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yes/15">
          <Check className="h-8 w-8 text-yes" />
        </div>
        <h1 className="font-display text-3xl font-bold text-text-primary mb-3">🎉 ${sym} is yours!</h1>
        <p className="text-text-muted text-sm mb-8 max-w-sm">{successMsg}</p>
        <div className="flex gap-3">
          {creator && (
            <Link
              href={`/creators/${creator.slug}`}
              className="rounded-xl bg-caldera px-6 py-2.5 text-sm font-semibold text-white"
            >
              View your token →
            </Link>
          )}
          <Link
            href="/"
            className="rounded-xl border border-border-subtle px-6 py-2.5 text-sm text-text-muted hover:text-text-primary"
          >
            Browse markets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      {/* Hero */}
      <div className="mb-8 text-center">
        {creator && (
          <div className="mb-4 flex justify-center">
            {(creator.profile_pic_url ?? creator.image_url) ? (
              <img
                src={(creator.profile_pic_url ?? creator.image_url)!}
                alt={creator.name}
                className="w-20 h-20 rounded-full border-4 border-caldera/30 object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-caldera/20 flex items-center justify-center border-4 border-caldera/30">
                <span className="text-2xl font-bold text-caldera">{creator.name[0]?.toUpperCase()}</span>
              </div>
            )}
          </div>
        )}
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
          Claim your <span className="text-caldera">${sym}</span> token
        </h1>
        <p className="text-text-muted text-sm">
          You&apos;re about to earn fees from every prediction market about you on Caldera.
        </p>
      </div>

      {/* Step list */}
      <div className="mb-8 space-y-1">
        {CODE_STEPS.map(({ n, title }) => (
          <div
            key={n}
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'var(--bg-surface)' }}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-caldera/15 text-[11px] font-bold text-caldera">
              {n}
            </span>
            <span className="text-sm text-text-primary">{title}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Copy code */}
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Step 1 — Your unique code
        </p>
        <div className="flex items-center justify-between rounded-xl bg-background px-5 py-4">
          <span className="font-mono text-xl font-bold tracking-widest text-caldera">{code}</span>
          <button
            onClick={copyCode}
            className="rounded-lg p-2 text-text-muted hover:text-text-primary transition-colors"
          >
            {copied ? <Check className="h-5 w-5 text-yes" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-faint">
          This code is unique to you. Do not share it with anyone else.
        </p>
      </div>

      {/* Step 2: Post instructions */}
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Step 2 — Post it publicly
        </p>
        <p className="text-sm text-text-muted mb-3">
          Post <strong className="text-text-primary font-mono">{code}</strong> publicly on any social platform:
        </p>
        <div className="flex flex-wrap gap-2">
          {['Twitter / X', 'TikTok', 'Instagram', 'Kick', 'YouTube Community'].map(s => (
            <span key={s} className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-muted">
              {s}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-text-faint">
          Just the code, nothing else needed. The post must be publicly visible.
        </p>
      </div>

      {/* Step 3: Connect wallet */}
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Step 3 — Connect DeSo wallet
        </p>
        {isConnected ? (
          <div className="flex items-center gap-2 text-sm text-yes">
            <Check className="h-4 w-4" />
            Wallet connected
          </div>
        ) : (
          <button
            onClick={() => connectDeSoWallet()}
            className="rounded-xl bg-caldera px-5 py-2.5 text-sm font-semibold text-white hover:bg-caldera/90 transition-colors"
          >
            Connect DeSo Wallet
          </button>
        )}
      </div>

      {/* Step 4: Paste URL + claim */}
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Step 4 — Paste your post URL
        </p>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-background px-3">
          <ExternalLink className="h-4 w-4 shrink-0 text-text-faint" />
          <input
            type="url"
            value={postUrl}
            onChange={e => setPostUrl(e.target.value)}
            placeholder="https://x.com/yourhandle/status/..."
            className="flex-1 bg-transparent py-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
          />
        </div>
        {error && <p className="mb-3 text-xs text-no">{error}</p>}
        <button
          onClick={handleClaim}
          disabled={claimLoading || !isConnected || !postUrl.trim()}
          className="w-full rounded-xl bg-caldera py-3 text-sm font-bold text-white hover:bg-caldera/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {claimLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </span>
          ) : (
            'Verify & Claim →'
          )}
        </button>
        {!isConnected && (
          <p className="mt-2 text-center text-[11px] text-text-faint">
            Connect your wallet first (Step 3)
          </p>
        )}
      </div>
    </div>
  );
}

// ─── ClaimSlugPage (new flow: creator slug) ──────────────────────────────────

type SlugCreator = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  profile_pic_url: string | null;
  deso_username: string | null;
  creator_coin_holders: number;
  token_status: string;
};

type SlugMarket = {
  id: string;
  title: string;
  yes_price: number | null;
};

function ClaimSlugPage({ slug }: { slug: string }) {
  const [creator, setCreator] = useState<SlugCreator | null>(null);
  const [markets, setMarkets] = useState<SlugMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [step, setStep] = useState<'landing' | 'verify' | 'creating' | 'done'>('landing');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/creators/${slug}`).then(r => r.json()),
      fetch(`/api/markets?creatorSlug=${slug}&limit=10`).then(r => r.json()),
    ]).then(([creatorData, marketsData]) => {
      setCreator(creatorData.creator ?? creatorData.data ?? null);
      setMarkets(marketsData.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug]);

  const displayName = slug
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase())
    .trim();

  const estimatedMonthlyEarnings = markets.length * 5000 * 0.01 * 4;
  const avatarUrl = creator?.profile_pic_url ?? creator?.image_url;

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
      await new Promise<void>(r => setTimeout(r, 5000));
      setStep('done');
    } catch {
      setVerifyError('Something went wrong. Please try again.');
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 text-center">

        {/* Avatar */}
        <div className="mb-6">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={creator?.name ?? displayName}
              className="w-24 h-24 rounded-full mx-auto border-4 border-orange-500/30 object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto bg-orange-500/20 flex items-center justify-center border-4 border-orange-500/30">
              <span className="text-3xl font-bold text-orange-400">
                {(creator?.name ?? displayName)[0]?.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Headline */}
        <h1 className="text-3xl font-bold mb-3 text-[var(--color-text)]">
          {creator?.name ?? displayName}, you have a token on Caldera
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

        {/* Empty state */}
        {markets.length === 0 && !creator && (
          <div className="mb-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              No markets yet — be the first to create one
            </p>
            <a
              href={`/creators/${slug}`}
              className="text-sm font-semibold text-orange-400 hover:text-orange-300 underline underline-offset-2"
            >
              View {displayName}&apos;s profile →
            </a>
          </div>
        )}

        {/* Markets preview */}
        {markets.length > 0 && (
          <div className="mb-8 text-left">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              Active predictions about you
            </h2>
            <div className="space-y-2">
              {markets.slice(0, 3).map(market => (
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

        {/* Step: landing */}
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

        {/* Step: verify */}
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
            {verifyError && <p className="text-xs text-red-400 mb-3">{verifyError}</p>}
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

        {/* Step: creating */}
        {step === 'creating' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-semibold text-[var(--color-text)]">Creating your DeSo profile...</p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">This takes about 10 seconds</p>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2 text-[var(--color-text)]">Token claimed!</h2>
            <p className="text-[var(--color-text-muted)] mb-6">
              Your DeSo profile is live. Every prediction market trade about you now
              auto-buys your token.
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
}
