import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_KEYS } from '@/lib/admin/market-generator';
import { queueAllCreatorsForDesoCreation } from '@/lib/admin/pipeline';

export async function POST(req: NextRequest) {
  try {
    const { desoPublicKey, adminPassword } = await req.json();
    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || '') ||
      !!(process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const supabase = await createClient();
    const queued = await queueAllCreatorsForDesoCreation(supabase);
    return NextResponse.json({ queued });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
