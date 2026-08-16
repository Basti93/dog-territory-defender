# CLAUDE.md — Rules for Claude Code & AI Coding Agent Sessions

This file tells Claude (and any AI coding agent) how to collaborate on **Dog Territory Defender**. Read this at the start of every session.

---

## Project essentials

- **Product:** Location-based mobile game for urban dog owners. Spring-like, joyful. Cookie-clicker background loop. Anti-snowball social layer.
- **Status tracker:** [README.md](README.md) — check Project Status section first.
- **Master build plan:** [docs/01-prototype-plan-prompt.md](docs/01-prototype-plan-prompt.md) (5-phase lean-startup plan). **Do not deviate from the phase-gated approach.**
- **Per-phase validation:** [docs/02-post-prototype-investigation-prompt.md](docs/02-post-prototype-investigation-prompt.md) (run at end of each phase).
- **Visual direction:** [docs/03-design-brief.md](docs/03-design-brief.md).
- **Engagement mechanics:** [docs/04-engagement-mechanics.md](docs/04-engagement-mechanics.md) (The Den, The Pack, anti-snowball).
- **Design update prompt:** [docs/05-design-update-prompt.md](docs/05-design-update-prompt.md) (evolve the prototype as phases progress).
- **Decisions log:** [DECISIONS.md](DECISIONS.md) (append-only, newest first).
- **Visual prototype:** [prototype/](prototype/) — clickable HTML demo. Match its output, not its internal structure.
- **Spec-driven workflow:** [openspec/](openspec/) (OpenSpec, `openspec/config.yaml`). **Always use the OpenSpec flow for non-trivial changes** — don't jump straight to code. `/opsx:explore` → `/opsx:propose <feature-name>` → `/opsx:apply` → `/opsx:archive`.

---

## Dev commands

```bash
npm install        # install deps (legacy-peer-deps=true set in .npmrc)
npm run start       # expo start — QR code, pick platform
npm run android      # expo start --android
npm run ios          # expo start --ios
npm run web           # expo start --web
```

No lint or test scripts configured (`package.json` has none). Don't invent `npm run lint`/`npm test` commands — they don't exist yet.

Stack: Expo SDK 54, React Native 0.74, React 18, TypeScript 5.3 (strict via `expo/tsconfig.base`). `eas.json` has build profiles (`development`/`preview`/`production`) but no build has been run from this repo yet.

## Architecture (current implementation, Phase 0)

Single-screen app, all state in `App.tsx` via `useState`/`useRef` — no navigation, no backend, no persistence. One `Walk` in flight at a time.

- `src/types.ts` — `Location`, `Walk`, `TerritoryPolygon`, `AppState` interfaces.
- `src/utils/gps.ts` — thin wrapper over `expo-location`: `requestLocationPermission` (foreground + background), `startWatchingLocation` (1s / 2m interval callback), `getInitialLocation`.
- `src/utils/geometry.ts` — `getDistance` (haversine), `canCloseWalk` (≥10 points AND start↔end < 20m — these thresholds are load-bearing, see [docs/04-engagement-mechanics.md](docs/04-engagement-mechanics.md) before changing), `calculatePolygonArea` (shoelace formula), `locationsToPolygon`.
- `src/components/MapCanvas.tsx` — renders the trail/territory by projecting raw lat/lon into an SVG viewBox (`react-native-svg` `Polyline`/`Polygon`/`Circle`), scaled to the bounding box of visited points. **This is not a real map** — no tiles, no `react-native-maps`, no pan/zoom. README's "Architecture" section describes a `MapView`-based approach; that's aspirational/stale, not what's implemented.
- `src/web/mapHTML.ts` — a Leaflet-in-WebView HTML string. **Currently unused/dead code** — not imported anywhere. Leftover from an earlier map approach; either wire it up or remove it, don't assume it's live.

State flow (`App.tsx`): `startWalk()` creates a `Walk`, starts the location subscription → each GPS callback appends to `walk.locations` → `canCloseWalk()` gates the "Close Territory" button → `stopWalk()` runs `locationsToPolygon()` and marks the walk closed → `resetWalk()` clears state for the next walk.

`prototype/` is the design spec (standalone HTML + React via Babel, not a real build) — see rule 1 below and `prototype/README.md`. Match its visuals/behavior; never import its structure into `src/`.

---

## For AI Coding Agents — Implementation handoff

When implementing the real app (i.e., you're not just planning):

1. **The prototype is a design spec, not a starter codebase.** It's HTML + React Babel standalone — meant to be pixel-recreated in React Native + Expo (the target stack). Don't copy its structure; match its visuals and behaviors.
2. **Always confirm the phase before writing code.** Ask: "Are we implementing Phase 0, 1, 2, 3, or 4?" Build only what that phase needs.
3. **Read the `PARKED FOR LATER PHASES` comment block** at the top of `prototype/Dog Territory Defender.html` — those features are explicitly deferred and must not leak into earlier phases.
4. **Use the design tokens** defined in the prototype (`T.green`, `T.blue`, etc.). No new colors without an entry in [DECISIONS.md](DECISIONS.md).
5. **Re-read [docs/04-engagement-mechanics.md](docs/04-engagement-mechanics.md)** before touching anything related to treats, the Den, building levels, or anti-snowball. Numeric thresholds there are load-bearing.
6. **When ambiguity arises, ask the user — don't guess.** Scope clarification is cheap; rebuilding is not.
7. **After implementation of a phase:** run [docs/02-post-prototype-investigation-prompt.md](docs/02-post-prototype-investigation-prompt.md) to validate before advancing.

---

## Your Core Responsibilities

### 1. Keep the project plan up-to-date

When any of the following changes, update the relevant doc **in the same turn**:

| Change | Update |
|---|---|
| New feature decided | `docs/01-prototype-plan-prompt.md` (assign to a phase) + `DECISIONS.md` |
| Visual / UX direction shifts | `docs/03-design-brief.md` + `DECISIONS.md` |
| Game mechanic added or changed | `docs/04-engagement-mechanics.md` + `DECISIONS.md` |
| Phase hypothesis validated/invalidated | `README.md` status + `DECISIONS.md` |
| Tech stack / architecture decision | `docs/01-prototype-plan-prompt.md` (architecture section) + `DECISIONS.md` |
| Tone / language guideline added | `docs/03-design-brief.md` + `DECISIONS.md` |
| Prototype files added/renamed | `README.md` folder map + `prototype/README.md` |

**Rule:** No silent drift. If the plan no longer matches reality, fix it now.

### 2. Log every significant decision in `DECISIONS.md`

Entry format:

```markdown
## YYYY-MM-DD — [Short title]
**Area:** Architecture / Design / Game / Tone / Product
**Decision:** [What was decided, in one sentence]
**Why:** [The rationale — especially the tradeoffs considered]
**Alternatives rejected:** [What else was considered and why not]
**Affects:** [Which files / phases / features this touches]
**Decided by:** [User / Claude / discussion]
```

**Significant** = tech choices, mechanic changes, numeric thresholds, cutting features, tone shifts, architecture moves, user preferences revealed.
**Not significant** = typos, reordering bullets, wording clarifications that don't change meaning.

### 3. Memorize key decisions to long-term memory

For decisions that should persist across conversations, save to the memory system (see auto memory instructions at session start). Memory types:
- **user** — role/preferences (e.g., "the owner is a Senior Fullstack Developer")
- **project** — ongoing context (e.g., "Dog Territory Defender targets EU, Berlin-first beta")
- **feedback** — collaboration guidance
- **reference** — pointers to external systems

`DECISIONS.md` is the authoritative log. Memory is the quick-recall cache.

### 4. Respect phase boundaries

- **Never** build Phase 3 features in Phase 1.
- Every feature request: first classify which phase it belongs to.
- If out-of-phase, push back kindly and park it for later.
- Scope creep is how prototypes die.

### 5. Preserve the tone

- **Spring-like, friendly, joyful, dog-centric.**
- Never "conquer," "destroy," "kill," "battle." Use "claim," "defend," "protect."
- No dark mode.
- Copy is warm and celebratory, not transactional.
- Match the tone of existing files in any new file.

### 6. Don't guess — check

- Before referencing a file, verify with `ls` or `Glob`.
- Before citing a numeric threshold, read it from the source doc.
- Before proposing a mechanic, check `docs/04-engagement-mechanics.md` — it may exist.
- Memory can be stale — verify against current files.

### 7. Default behaviors

- **Prefer editing over creating** new files. Each doc has a purpose; justify a new one first.
- **Keep docs concise.** Every doc is meant to be read end-to-end.
- **Update `README.md`** folder map when adding or moving files.
- **Update `DECISIONS.md`** when anything non-trivial is decided.

---

## How to start a new session

1. Read `CLAUDE.md` (this file) → collaboration rules
2. Read `README.md` → current status, folder map, phase we're in
3. Skim `DECISIONS.md` → recent decisions (last 5–10 entries)
4. Check `MEMORY.md` (if memory system is available) → user preferences + project context
5. If working on implementation: open `prototype/Dog Territory Defender.html` in a text editor to see the design spec
6. Ask the user: "What are we working on today, and which phase?"

---

## Anti-patterns to avoid

- ❌ Building Phase 3+ features when we're still in Phase 1
- ❌ Updating a doc without an entry in `DECISIONS.md`
- ❌ Forgetting to update `README.md` status after a phase completes
- ❌ Using aggressive/competitive language
- ❌ Proposing dark mode, emoji-heavy UI, or aggressive monetization
- ❌ Silently changing a numeric threshold without logging why
- ❌ Creating a new `.md` file when an existing one could be extended
- ❌ Copying the prototype's React-Babel-standalone structure into production code
- ❌ Starting to code before confirming the target phase with the user

---

**Remember:** The phased plan is sacred. The tone is spring. The dog is the star. The walk is the heartbeat.
