/**
 * Returns the canonical display symbol for a creator/token.
 * Prefers explicit fields, falls back to slug-derived PascalCase.
 *
 * Examples:
 *   { deso_username: "CalderaCreators" } → "CalderaCreators"
 *   { slug: "nader" } → "Nader" (single word, capitalized)
 *   { slug: "caldera-eth", deso_username: null } → "CalderaEth"
 */
export function getTokenSymbol(creator: {
  slug?: string | null;
  deso_username?: string | null;
  creator_coin_symbol?: string | null;
  token_symbol?: string | null;
} | null | undefined): string {
  if (!creator) return '';
  if (creator.token_symbol) return creator.token_symbol;
  if (creator.creator_coin_symbol) return creator.creator_coin_symbol;
  if (creator.deso_username) return creator.deso_username;
  if (creator.slug) {
    return creator.slug
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
  return '';
}

/** Display version with $ prefix, for UI. Example: "$CalderaCreators" */
export function getTokenSymbolDisplay(
  creator: Parameters<typeof getTokenSymbol>[0]
): string {
  const symbol = getTokenSymbol(creator);
  return symbol ? `$${symbol}` : '';
}
