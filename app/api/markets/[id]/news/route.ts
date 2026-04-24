import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── P2-3.5: per-IP rate limit (30/60s) ──────────────────────────
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const rl = await checkRateLimit(`news-ip:${clientIp}`, 'news');
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limited' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': String(rl.resetAt),
        },
      }
    );
  }
  // ── end P2-3.5 ───────────────────────────────────────────────────

  try {
    const { id } = await params;
    const { createClient } = await import('@/lib/supabase/server');
    const db = await createClient();

    const { data: market } = await db
      .from('markets')
      .select('title, creator_slug')
      .eq('id', id)
      .single();

    if (!market) return NextResponse.json({ articles: [] });

    // Build search query from market title
    const query = market.title
      .replace(/^Will /, '')
      .replace(/\?$/, '')
      .substring(0, 80);

    const res = await fetch(
      `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}&count=3&freshness=pw`,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY ?? '',
        },
      }
    );

    if (!res.ok) return NextResponse.json({ articles: [] });

    const data = await res.json() as { results?: Array<{ title: string; url: string; meta_url?: { hostname?: string }; age?: string }> };
    const articles = (data.results ?? []).slice(0, 3).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.meta_url?.hostname?.replace('www.', '') ?? '',
      age: a.age ?? '',
    }));

    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
