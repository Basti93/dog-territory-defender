/**
 * The name to put into "{partner} sees your path": the other household member's display name. `players` is the
 * household's playerId -> name map from sync state. With more than one other member the alphabetically first name wins
 * (stable, and households are two people today). Null when nobody else is known; callers then say "dein Haushalt".
 */
export function pickPartnerName(myPlayerId: string, players: Record<string, string>): string | null {
  const names = Object.entries(players)
    .filter(([id, name]) => id !== myPlayerId && name.trim().length > 0)
    .map(([, name]) => name.trim())
    .sort((a, b) => a.localeCompare(b));
  return names[0] ?? null;
}
