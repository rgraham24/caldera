/**
 * Caldera display-name derivation.
 *
 * ~99.4% of creator rows have `name === deso_username` because the
 * import pipeline seeds `name` from the handle when no display name
 * exists on the DeSo profile. For those we titlecase the handle so
 * "diddy" reads as "Diddy". For hand-cleaned creators (LeBron James,
 * Donald Trump, MrBeast, etc.) `name` differs from the handle and is
 * used as-is.
 */
export type CreatorNameInput = {
  name?: string | null;
  deso_username?: string | null;
  twitter_handle?: string | null;
};

export function getCreatorDisplayName(c: CreatorNameInput): string {
  const name = (c.name ?? "").trim();
  const handle = (c.deso_username ?? "").trim();
  const twitter = (c.twitter_handle ?? "").trim();

  if (name && handle && name.toLowerCase() !== handle.toLowerCase()) {
    return name;
  }

  if (twitter) return `@${twitter}`;

  if (handle) {
    return handle.charAt(0).toUpperCase() + handle.slice(1);
  }

  return name || "Unknown";
}
