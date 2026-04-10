import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_KEYS } from '@/lib/admin/market-generator';
import { cleanSquatterProfiles } from '@/lib/admin/pipeline';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { desoPublicKey, adminPassword } = await req.json();
    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || '') ||
      !!(process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const supabase = await createClient();
    const cleaned = await cleanSquatterProfiles(supabase, 200);
    return NextResponse.json({ cleaned });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
