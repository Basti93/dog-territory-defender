# Visual Design Specification

Visual identity, tone, tokens and screen intent so every build reads as warm, spring-like and dog-centric. North Star: after a walk the player looks at the map and thinks "I just did that. My dog did that. We belong here." The walk is the heartbeat (phone in the pocket, eyes on the dog, minimal audio-first cues); the real game (Den progression, async events, upgrade decisions) lives in the 23.5 hours between walks.

## Design tokens
Exactly these; a new colour needs a `docs/decisions/LOG.md` entry explaining why (see `docs/decisions/2026-08-21-home-range.md` for the Bloom ends).
- Primary green (territory/growth, Bloom "fresh" end): `#2ECC71`
- Wild meadow (Bloom "wild" end): `#DCE8BE`
- Sky blue (map/safety): `#3498DB`
- Warm accent (collectibles/joy): `#F39C12`
- Dog brown (UI elements, badges): `#8B6F47`
- White/neutral: `#FAFAF8`
- Avatar-only free colours (Buddy fur zones, 2026-10-24): any player-chosen fur colour always passes through the pure `softenToClay(hex)` (`src/buddy/buddyAppearance.ts`: saturation <= 0.70, lightness 0.22-0.95, neutrals stay neutral) before it is stored or drawn, so the dog stays clay-pastel. UI chrome keeps the tokens above; these colours never leave the avatar.
- Headline: rounded sans (e.g. Sora or Nunito), friendly not corporate. Body: clean sans (e.g. Inter), readable small. Minimum text size 12px (outdoor readability).

## Tone and exclusions
- Warm and celebratory, not transactional; no aggressive or PvP language. Use "claim," "defend," "protect"; never "conquer," "destroy," "kill," "battle" (also for territory overlap and PvP copy).
- No dark mode (too aggressive for the outdoor spring vibe); no dark-mode option in any settings/appearance screen.
- No gamey chrome (XP bars everywhere, battle UI, power meters). No dog photos: dogs are illustrations/avatars (inclusivity, playfulness).

## Key screens
- **Map tiles:** soft spring wash, not grey: parks, water and paths stay recognisable (`MAP_TILE_FILTER` in `src/web/mapTheme.ts`, linen tint and paper weave at 0.15) so the felt patches stay readable on top.
- **Map View:** map dominates full screen. Active walk: state obvious (time, distance), Finish/Cancel easy to reach but not accidental. Idle: shows the player's full Home Range (Range outline plus Bloom fill, every walk ever recorded, not only the latest) as the soft rounded outline / colour-only freshness fill from `docs/decisions/2026-08-21-home-range.md`, not per-walk shapes.
- **Territory Claimed (Homecoming / Heimkehr, plays over the home scene; no separate celebration screen):** peak-joy moment; shows what was claimed and the dog's XP/level progress; ends with a clear call to the next walk.
- **Dog Profile:** dog is the star; stats about walks and community, not power creep; badges feel earned.
- **Leaderboard (backlog, not built):** friendly competition celebrating all dogs; reached by tapping from the map (modal), not a primary tab.
- **Den (the buildings page of the home scene "Unser Viertel": Hof, fence zone and buildings are one vertical scroll; the buildings stand below the Hof, 2 per row on one ground, tapping one opens an upgrade panel docked at the screen bottom; no separate Den screen):** buildable home base; the current cheapest affordable "next upgrade" is always visibly called out with its cost (pennant and sparkle on the building, and a pennant plus "Upgrade bereit" on the strip at the Hof's bottom that leads down); every building sprite is drawn at one shared size (one world scale, stage 5 simply has more art), the 4th slot is reserved for the Friend Lounge and draws nothing; buildings feel alive (idle touches, spring theming), no stat-dashboard chrome (bare progress bars, power meters); upgrading reads as building a bigger yard, not leveling a stat.

## Postcards on the Bench (Album)
- Every finished tracked walk that went somewhere is a two-sided postcard derived from the walk (nothing extra stored). A walk that painted nothing gets none; a manual log is a handwriting-only card (no route, no flip).
- Front: the walk's trail on the muted patchwork. Back (handwritten, `hand` font, ink green): weekday plus part of day (Morgen, Vormittag, Mittag, Nachmittag, Abend, Nacht), the distance, "drei neue Straßen" only when there were new streets, one Buddy line chosen from what was special that day (new territory, first-time place, long walk, morning/evening/night, fallback pool), and a postmark with the territory name.
- The bench in the yard fans the 3 newest cards as small static paper cards (no WebView, no text, no counter; with more than three, still only the three newest and no number). One card, Buddy's favourite (first-time place, else new territory, else longest walk), carries a small paw stamp without explanation.
- Tapping the bench opens the Album: calm grid of every card, newest first, never pruned. An opened card turns over by tap or swipe (a transform, never an opacity fade, because the front hosts a WebView; at most one card WebView exists at a time); Back turns it face-up before closing.
- Cards never compare walks, show a total, or offer share/export, and stay quiet: no repeat of the homecoming's star number as a headline.

## Delight moments
Where the screen exists: paw prints briefly on map pull-to-refresh; bounce plus "ding" when a collectible is tapped and collected; subtle red outline on overlapping rival territory (own stays green) with a "defend" action (walk it again) on tap; level-up beat in the homecoming with tail-wag animation and ticking XP counter; gentle, not aggressive, confetti at the end of a walk.

## Scope and success
- Visual/UI work is scoped to items pulled from the backlog (`game-backlog`): add only the pulled item's screens/components, reuse existing tokens and components, park other ideas in the backlog instead of building early.
- Success when all four hold: a parent says the app makes the dog walk more fun, not stressful; the map stays the primary visual element with chrome fading into the background; claiming territory feels like "I made my mark on the neighborhood," not "I leveled up a metric"; two people walking together can both play without feeling like competitors. Check every design review against all four.
