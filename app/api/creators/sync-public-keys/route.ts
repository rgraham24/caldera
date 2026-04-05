import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreatorProfile } from "@/lib/deso/api";

export async function GET() {
  const supabase = await createClient();

  const { data: creators } = await supabase
    .from("creators")
    .select("id, deso_username, deso_public_key")
    .not("deso_username", "is", null);

  if (!creators) return NextResponse.json({ data: { synced: 0 } });

  let synced = 0;
  for (const c of creators) {
    if (c.deso_public_key) { synced++; continue; }
    try {
      const profile = await getCreatorProfile(c.deso_username!);
      if (profile?.PublicKeyBase58Check) {
        await supabase
          .from("creators")
          .update({ deso_public_key: profile.PublicKeyBase58Check })
          .eq("id", c.id);
        synced++;
      }
    } catch { /* skip */ }
  }

  return NextResponse.json({ data: { synced, total: creators.length } });
}
