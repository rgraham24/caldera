import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { title, creatorSlug, creatorName, resolveAt, category } = await req.json();

    // Validate
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

    const supabase = await createClient();

    // Generate a unique slug
    const baseSlug = slugify(title).substring(0, 60);
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

    // Insert market
    const { data: market, error } = await supabase
      .from('markets')
      .insert({
        title: title.trim(),
        slug: uniqueSlug,
        description: `Community prediction market about ${creatorName}. Created by a fan on Caldera.`,
        category: category ?? 'Creators',
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
