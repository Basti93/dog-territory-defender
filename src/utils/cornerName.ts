// Names of "Unsere Ecken". A corner is never blank: the household's name wins, else "Ecke {street}" from the street
// found at the spot, else a neutral line. Copy goes through t(), so the language follows the switch.

import { CORNER_CONFIG } from '../economy/corners';
import { t } from '../i18n';

// Characters are counted as the server counts them (code points), so an emoji is cut whole, never in half.
const toCharacters = (text: string) => Array.from(text);

/** What the player typed, made ready to store: control characters dropped, trimmed, at most 24 characters, null when nothing is left. */
export function cleanCornerName(raw: string): string | null {
  const name = toCharacters(raw.replace(/[\u0000-\u001F\u007F]/g, ' ').trim()).slice(0, CORNER_CONFIG.nameMaxLength).join('').trim();
  return name.length > 0 ? name : null;
}

function fitSign(text: string): string {
  const max = CORNER_CONFIG.nameMaxLength;
  const characters = toCharacters(text);
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join('').trimEnd()}…`;
}

/** What the sign says: the household's name, else "Ecke {street}" / "{street} corner", else "Unsere Ecke" / "Our corner". Always 1..24 characters. */
export function cornerDisplayName(corner: { name: string | null; street: string | null }): string {
  if (corner.name) return fitSign(corner.name);
  const street = corner.street?.trim();
  return fitSign(street ? t('corner.name.auto', { street }) : t('corner.name.fallback'));
}
