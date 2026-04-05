import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { publicKey, username, avatarUrl } = await req.json();

    if (!publicKey) {
      return NextResponse.json(
        { error: "Public key required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Look up or create user by DeSo public key
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("deso_public_key", publicKey)
      .single();

    if (existingUser) {
      return NextResponse.json({ data: existingUser });
    }

    // Create new user
    const handle =
      username || `deso_${publicKey.slice(-8).toLowerCase()}`;

    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        username: handle,
        display_name: username || handle,
        deso_public_key: publicKey,
        avatar_url: avatarUrl || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: newUser }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
