## MODIFIED Requirements

### Requirement: Design Tokens
The system SHALL use exactly these design tokens, extended only via the introducing change's `proposal.md`/`design.md` explaining why:
- Primary green (territory/growth, Bloom "fresh" end): `#2ECC71`
- Wild meadow (Bloom "wild" end — see `openspec/changes/archive/` home-range's `design.md` Decision 2): `#DCE8BE`
- Sky blue (map/safety): `#3498DB`
- Warm accent (collectibles/joy): `#F39C12`
- Dog brown (UI elements, badges): `#8B6F47`
- White/neutral: `#FAFAF8`
- Muted grey (context/background chrome — e.g. de-emphasized map overlays, secondary text): `#8A9A8A` (see `openspec/changes/walk-portrait/design.md` Decision 3 — formalizes an already-informally-used UI text color for its first use as a map-rendering color, the Walk Portrait's muted Home Range background context layer)
- Headline typeface: rounded sans (e.g. Sora or Nunito) — friendly, not corporate
- Body typeface: clean sans (e.g. Inter) — readable at small sizes
- Minimum text size: never below 12px, for outdoor readability

#### Scenario: New color needed
- **WHEN** a screen needs a color not in the token list
- **THEN** it SHALL NOT be added without a corresponding OpenSpec change explaining why
