import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';
import { creatorIsVerifiedForMarkets } from '@/lib/creators/validity';

/** Stable 8-char hex fingerprint of the IP — good enough for rate limiting. */
async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf))
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      creatorSlug,
      creatorName,
      resolveAt,
      category,
      desoPublicKey,
      // YouTube-milestone wizard fields. Optional — when marketType is
      // omitted or 'standard', behavior is unchanged from the existing
      // per-creator inline modal.
      marketType,
      targetSubscribers,
      creatorYoutubeHandle,
    } = body as {
      title?: string;
      creatorSlug?: string;
      creatorName?: string;
      resolveAt?: string;
      category?: string;
      desoPublicKey?: string;
      marketType?: 'standard' | 'youtube_subscribers';
      targetSubscribers?: number;
      creatorYoutubeHandle?: string;
    };

    const isYoutubeMilestone = marketType === 'youtube_subscribers';

    // 1. Wallet required
    if (!desoPublicKey || typeof desoPublicKey !== 'string' || !desoPublicKey.trim()) {
      return NextResponse.json(
        { error: 'Wallet connection required to create markets' },
        { status: 400 }
      );
    }

    // 2. Title / date validation
    if (!title || title.length < 10 || title.length > 120) {
      return NextResponse.json({ error: 'Title must be 10-120 characters' }, { status: 400 });
    }
    if (!resolveAt) {
      return NextResponse.json({ error: 'Resolve date required' }, { status: 400 });
    }

    const resolveDate = new Date(resolveAt);
    const now = new Date();
    // YouTube milestone markets get a wider window (1y) because the
    // wizard offers 3/6/12 month chips. Standard fan markets keep the
    // original 90-day cap.
    const maxDays = isYoutubeMilestone ? 365 : 90;
    const maxDate = new Date(now.getTime() + maxDays * 86400000);

    if (resolveDate <= now) {
      return NextResponse.json({ error: 'Resolve date must be in the future' }, { status: 400 });
    }
    if (resolveDate > maxDate) {
      return NextResponse.json(
        { error: `Resolve date must be within ${maxDays} days` },
        { status: 400 }
      );
    }

    if (isYoutubeMilestone) {
      if (!targetSubscribers || typeof targetSubscribers !== 'number' || targetSubscribers < 1) {
        return NextResponse.json(
          { error: 'Subscriber target must be a positive number' },
          { status: 400 }
        );
      }
    }

    if (!creatorSlug || typeof creatorSlug !== 'string' || !creatorSlug.trim()) {
      return NextResponse.json(
        { error: 'Please select a creator for this market.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fail-closed: creator must be verified for markets. See lib/creators/validity.ts.
    const validation = await creatorIsVerifiedForMarkets(creatorSlug, supabase);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: `We couldn't find a verified creator with slug "${creatorSlug}". Markets can only be created about verified creators on Caldera.`,
        },
        { status: 400 }
      );
    }

    // 3. IP rate limit — max 3 fan markets per IP per hour.
    // We store the ip_hash in rules_text for fan markets (they have no real rules).
    const ip = getIp(req);
    const ipHash = await hashIp(ip);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const { count: recentCount } = await supabase
      .from('markets')
      .select('id', { count: 'exact', head: true })
      .eq('is_fan_created', true)
      .eq('rules_text', ipHash)
      .gte('created_at', oneHourAgo);

    if ((recentCount ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'Too many markets created. Try again later.' },
        { status: 429 }
      );
    }

    // 4. Insert market
    const baseSlug = slugify(title).substring(0, 60);
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
    const effectiveCategory = category ?? 'Creators';

    // Base insert payload — applies to all fan markets.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertPayload: Record<string, any> = {
      title: title.trim(),
      slug: uniqueSlug,
      description: `Community prediction market about ${creatorName}. Created by a fan on Caldera.`,
      category: effectiveCategory,
      creator_slug: creatorSlug ?? null,
      status: 'open',
      resolve_at: resolveDate.toISOString(),
      yes_price: 0.5,
      no_price: 0.5,
      yes_pool: 500,
      no_pool: 500,
      liquidity: 1000,
      total_volume: 0,
      is_fan_created: true,
      rules_text: ipHash,
    };

    // YouTube-milestone markets carry their settlement intent in the
    // existing typed columns. No new schema yet — the resolver session
    // will add typed channel_id / target_subscribers columns and read
    // them from there. For now the criteria string is the source of
    // truth for human resolution.
    if (isYoutubeMilestone) {
      const handleForCopy =
        creatorYoutubeHandle && creatorYoutubeHandle.trim().length > 0
          ? creatorYoutubeHandle.trim().replace(/^@/, '')
          : creatorName ?? creatorSlug ?? 'the creator';
      const formattedDate = resolveDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      insertPayload.market_subtype = 'youtube_subscribers';
      insertPayload.resolution_criteria = `Resolves YES if @${handleForCopy}'s YouTube channel crosses ${targetSubscribers!.toLocaleString()} subscribers by ${formattedDate}.`;
      insertPayload.resolution_source = 'youtube';
      insertPayload.auto_resolve_at = resolveDate.toISOString();
    }

    // Cast: insertPayload is a Record<string, any> because the YouTube
    // branch adds optional typed columns conditionally. The generated
    // Database types don't cover market_subtype / auto_resolve_at /
    // resolution_source on insert overloads cleanly, so we widen here.
    const { data: market, error } = await supabase
      .from('markets')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insertPayload as any)
      .select()
      .single();

    if (error) {
      console.error('[create-fan]', error);
      return NextResponse.json({ error: 'Failed to create market' }, { status: 500 });
    }

    return NextResponse.json({ success: true, market });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
