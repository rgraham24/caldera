import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

// GET /api/claim/code-info?code=CALDERA-XXXX-XXXX
// Returns the creator associated with a claim code and whether it's already claimed.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: claimRow } = await (supabase as DB)
    .from('claim_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (!claimRow) {
    return NextResponse.json({ error: 'Invalid claim code' }, { status: 404 });
  }

  const { data: creator } = await supabase
    .from('creators')
    .select('id, name, slug, deso_username, creator_coin_symbol, profile_pic_url, image_url')
    .eq('slug', claimRow.slug)
    .single();

  return NextResponse.json({
    creator: creator ?? null,
    alreadyClaimed: claimRow.status === 'claimed',
  });
}
