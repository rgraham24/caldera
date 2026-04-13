import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';

const CATEGORY_TOKENS: Record<string, string> = {
  Sports: 'caldera-sports',
  Music: 'caldera-music',
  Politics: 'caldera-politics',
  Entertainment: 'caldera-entertainment',
  Companies: 'caldera-companies',
  Climate: 'caldera-climate',
  Tech: 'caldera-tech',
  Commentary: 'caldera-creators',
  Streamers: 'caldera-creators',
  Viral: 'caldera-creators',
  Crypto: 'caldera-creators',
  Creators: 'caldera-creators',
};

function getCategoryTokenSlug(category: string): string {
  return CATEGORY_TOKENS[category] ?? 'caldera-creators';
}

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
    const { title, creatorSlug, creatorName, resolveAt, category, desoPublicKey } = body;

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
    const maxDate = new Date(now.getTime() + 90 * 86400000);

    if (resolveDate <= now) {
      return NextResponse.json({ error: 'Resolve date must be in the future' }, { status: 400 });
    }
    if (resolveDate > maxDate) {
      return NextResponse.json({ error: 'Resolve date must be within 90 days' }, { status: 400 });
    }

    // 3. IP rate limit — max 3 fan markets per IP per hour.
    // We store the ip_hash in rules_text for fan markets (they have no real rules).
    const ip = getIp(req);
    const ipHash = await hashIp(ip);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const supabase = await createClient();

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

    const { data: market, error } = await supabase
      .from('markets')
      .insert({
        title: title.trim(),
        slug: uniqueSlug,
        description: `Community prediction market about ${creatorName}. Created by a fan on Caldera.`,
        category: effectiveCategory,
        category_token_slug: getCategoryTokenSlug(effectiveCategory),
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
      })
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
