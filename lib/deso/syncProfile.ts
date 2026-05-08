/**
 * Refresh a user's local Caldera profile from their live DeSo profile.
 *
 * Called fire-and-forget on every successful login (see
 * /api/auth/deso-login) so users.* and creators.* self-heal from stale
 * data — e.g. usernames that landed as raw pubkeys at signup, missing
 * avatars, display name changes the user made on a different DeSo app.
 *
 * Stable identifiers we DO NOT touch:
 *   - users.id             (PK)
 *   - creators.slug        (URL path; rename only via deliberate manual SQL)
 *   - creators.id          (PK)
 *   - creators.deso_public_key  (the join key)
 *
 * Best-effort: any error is logged and swallowed so a flaky DeSo node
 * can't break the login flow.
 */

import { createServiceClient } from "@/lib/supabase/server";

const DESO_PROFILE_TIMEOUT_MS = 5000;

interface DesoProfileResponse {
  Profile?: {
    Username?: string;
    Description?: string | null;
    IsVerified?: boolean;
    PublicKeyBase58Check?: string;
    ExtraData?: {
      LargeProfilePicURL?: string;
      FeaturedImageURL?: string;
      [k: string]: unknown;
    };
  };
}

/**
 * Hard-timeout fetch to api.deso.org/get-single-profile keyed by pubkey.
 * Returns null on any failure (network, non-2xx, no Profile field).
 */
async function fetchDesoProfile(
  desoPublicKey: string
): Promise<DesoProfileResponse["Profile"] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DESO_PROFILE_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PublicKeyBase58Check: desoPublicKey }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: DesoProfileResponse = await res.json();
    return data.Profile ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Refresh users + creators rows from live DeSo profile data. Idempotent;
 * safe to call on every login. Never throws.
 */
export async function syncUserProfile(desoPublicKey: string): Promise<void> {
  if (!desoPublicKey) return;

  const profile = await fetchDesoProfile(desoPublicKey);
  if (!profile) {
    console.warn("[syncUserProfile] no profile from DeSo for", desoPublicKey.slice(0, 12) + "...");
    return;
  }

  const username = profile.Username?.trim() || null;
  // DeSo's profile-picture endpoint returns the user's avatar bytes.
  // We store the URL itself (rather than uploading the image to our own
  // CDN) — same convention used elsewhere in the app, e.g.
  // lib/deso/api.ts:117 for getCreatorCoinData.
  const avatarUrl = `https://node.deso.org/api/v0/get-single-profile-picture/${desoPublicKey}`;
  const isVerified = Boolean(profile.IsVerified);

  const supabase = createServiceClient();

  // Update users row (keyed by deso_public_key). Only updates the fields
  // we want to keep in sync with DeSo; leaves bio, balance, derived
  // keys, and other per-session state alone.
  if (username) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: usersErr } = await (supabase as any)
      .from("users")
      .update({
        username,
        display_name: username,
        avatar_url: avatarUrl,
        is_verified: isVerified,
        updated_at: new Date().toISOString(),
      })
      .eq("deso_public_key", desoPublicKey);
    if (usersErr) {
      console.warn("[syncUserProfile] users update failed:", usersErr.message);
    }
  }

  // Update creators row if one exists for this pubkey. Don't INSERT —
  // creator-table membership is a separate concern (verified-for-markets
  // gate, claim flow). If a row exists, refresh its display fields.
  if (username) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: creatorsErr } = await (supabase as any)
      .from("creators")
      .update({
        name: username,
        deso_username: username,
        image_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("deso_public_key", desoPublicKey);
    if (creatorsErr) {
      console.warn("[syncUserProfile] creators update failed:", creatorsErr.message);
    }
  }
}
