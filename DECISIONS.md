# Decisions Log

Append-only log of architecture, design, and game decisions for Dog Territory Defender. **Newest entries at the top.**

See [CLAUDE.md](CLAUDE.md) for the format and rules.

---

## 2026-08-16 — Local walk persistence via expo-sqlite, DynamoDB-shaped schema

**Area:** Architecture
**Decision:** Walks now persist locally via `expo-sqlite`, accessed only through a `WalkRepository` interface (`saveWalk`/`getWalks`/`getWalk`/`deleteWalk`) living in a new `src/storage/` module, separate from `App.tsx` and game-feature code. The local schema is single-table and NoSQL/DynamoDB-shaped (`id` as partition key, `startTime`/`closed` as queryable columns, the full walk as a JSON body) rather than relationally normalized, plus a `syncedAt` column (unused, always null for now) for forward-compat with a future cloud sync. A new "View Past Walks" screen lists saved walks. `WalkRepository`'s behavior contract is covered by tests run against an in-memory fake (new test infra: `jest` + `jest-expo`); the real SQLite adapter is verified manually, not by automated tests, since its native binding isn't meaningfully unit-testable under Jest.
**Why:** All walk data — including real GPS data from an actual dog walk — lived only in React state and was lost on reload/crash. The storage layer also needed to be stable enough that future game features (Den, scent layering, etc.) don't risk the walk record itself. The schema is modeled NoSQL-style specifically because the eventual target is AWS: DynamoDB's free tier is perpetual (RDS's is only 12 months), and the user wants to learn DynamoDB's single-table modeling mindset — shaping the local schema the same way now means the concepts transfer later even though the storage engine will change.
**Alternatives rejected:** WatermelonDB (built-in sync protocol is heavier than needed right now, plus native config friction in Expo managed workflow); Realm (its cloud sync path is MongoDB Atlas, not AWS — wrong ecosystem for the stated AWS-learning goal); AsyncStorage/plain JSON (no query engine, no migration story, weak fit for "tested core service with a stable schema"); a normalized relational schema (no current requirement needs querying inside a walk's locations, and it wouldn't map as cleanly onto a future DynamoDB table).
**Affects:** `src/storage/` (new: `WalkRepository.ts`, `sqliteWalkRepository.ts`, `inMemoryWalkRepository.ts`, contract tests), `src/components/WalkHistoryScreen.tsx` (new), `App.tsx` (calls `saveWalk` from `stopWalk`/`endWalk`, new history view toggle), `package.json` (adds `expo-sqlite`, `jest`, `jest-expo`, `@types/jest`, `test` script), `README.md`. Full spec: `openspec/changes/walk-history-persistence/`.
**Decided by:** User + Claude

## 2026-08-16 — End Walk split from Cancel; dev-only mock walk data

**Area:** Product / Architecture
**Decision:** Added an "End Walk" action, separate from "Cancel": it stops tracking and keeps the recorded trail as an open/unclosed walk (no territory polygon, no reward), whereas "Cancel" still discards the walk entirely. Also added a dev-only (`__DEV__`-gated) mock walk loader with two canned GPS fixtures (a closed loop and an open route) so the walk flow can be tested without physically walking.
**Why:** Phase 0's hypothesis ("GPS tracking feels accurate and satisfying to replay") doesn't require a closed loop, but the only way to stop an unclosed walk was "Cancel," which discarded everything — harsher than the hypothesis needs, and real dog walks are rarely tidy loops. Physically walking for every test cycle was also slowing iteration.
**Alternatives rejected:** Awarding points/treats for an early-ended walk (raised during discussion) — rejected as out-of-phase; Phase 0 has no economy. That idea is deferred to Phase 1, where "any walk earns treats, closed loop additionally earns territory" is already the planned reward split (see `openspec/specs/game-phases/spec.md`).
**Affects:** `App.tsx` (new `endWalk()` + `startMockWalkFlow()`, new UI buttons), `src/utils/mockGps.ts` (new), `src/utils/mockWalkFixtures.ts` (new), `README.md`. Full spec: `openspec/changes/end-walk-and-mock-data/`.
**Decided by:** User + Claude

## 2026-04-24 — Reorganised repo for AI coding agent handoff

**Area:** Product / Architecture
**Decision:** Moved planning prompts into `docs/`, flattened `prototype/project/*` up to `prototype/`, renamed `00-README.md` → `README.md`, deleted generic Claude-Design export README and `.DS_Store` files. Added a "For AI Coding Agents" section to `CLAUDE.md` and an agent-facing Quick Start to `README.md`. Added `prototype/README.md` explaining how to run and extend the visual prototype.
**Why:** Folder needed to be handoff-ready for an external AI coding agent or a human dev starting Phase 0. A flat list of numbered markdown files plus a nested `prototype/project/` was confusing. Standard `README.md` + `CLAUDE.md` + `docs/` + `prototype/` structure matches conventions agents already know.
**Alternatives rejected:** Keeping everything flat at root (OK for small projects, messy here with 8+ files); splitting prompts vs. reference docs into separate folders (overengineered for 5 files).
**Affects:** All root-level paths, cross-references in every doc.
**Decided by:** User + Claude

## 2026-04-24 — Phase 1 visual prototype complete

**Area:** Design / Product
**Decision:** Completed visual prototype of Phase 1 (Core Game Loop) via Claude Design. Additions: Den scene with 3 SVG buildings (Doghouse, Treat Bakery, Sniff Garden), tappable upgrade modals, global passive treat counter with configurable tick rate, post-walk celebration now awards +50 treats and teases next upgrade, 4-tab bottom nav (Map / Den / Dog / More), extended tweaks panel (`passiveTreatRate`, `startingTreats`, `denLevel`, `showDenBadge`). Phase 2+ features explicitly parked with a comment block at top of HTML.
**Why:** Validates the cookie-clicker hook visually before investing in real implementation. Lets user feel the core loop (walk → claim → earn treats → upgrade building → walk again with bigger bonus) in ~30 seconds.
**Alternatives rejected:** Skipping the visual prototype and going straight to React Native (too expensive if the UX didn't work); building all 10 Den buildings (out-of-phase, would have bloated the demo).
**Affects:** `prototype/Dog Territory Defender.html`, `prototype/den-screen.jsx`, `prototype/tweaks-panel.jsx`. Visual spec for when Phase 1 is implemented for real (after Phase 0 ships).
**Decided by:** User (via Claude Design)

## 2026-04-24 — Established phased prototype approach

**Area:** Product / Architecture
**Decision:** Build the prototype in 5 sequential phases (Walking Skeleton → Core Loop → Repetition → Social → Long-term Hooks). Each phase validates ONE hypothesis with real users before advancing.
**Why:** Original plan was big-bang (build everything, then audit). Lean-startup phase gating lets us kill bad assumptions in week 2 instead of week 10. Saves ~8 weeks if the core loop isn't fun.
**Alternatives rejected:** Big-bang full build (too risky, too long to first feedback); 2-phase split (not granular enough to isolate hypotheses).
**Affects:** `docs/01-prototype-plan-prompt.md`, `docs/02-post-prototype-investigation-prompt.md`, `README.md`
**Decided by:** User + Claude

## 2026-04-24 — The Den as cookie-clicker background loop

**Area:** Game
**Decision:** Introduce "The Den" — a buildable home base with 10 buildings × 100 levels each. Passive treat generation from Treat Bakery, % bonuses from other buildings. Starts with 3 buildings unlocked in Phase 1; grows through Phase 4.
**Why:** "Just earn treats" gets boring after 3 days. Visible progression with always-a-next-upgrade keeps players engaged during the 23.5 hours/day they're not walking. Cookie Clicker proved the formula.
**Alternatives rejected:** Pack-only (collection without building lacks vertical progression); Neighborhood-builder (too abstract, less personal than a Den for your dog).
**Affects:** `docs/04-engagement-mechanics.md`, `docs/01-prototype-plan-prompt.md` (Phase 1 & 4), visual prototype
**Decided by:** User + Claude

## 2026-04-24 — 10 anti-snowball mechanisms

**Area:** Game / Product
**Decision:** Layered anti-snowball defense: local leaderboards by zip code, rolling 7-day scoring as primary metric, soft caps (building bonuses cap at +50%), Beginner's Luck (2x for 30 days), mentor bonuses, seasonal resets (cosmetic only), co-op > compete events, walk frequency > total stats, asymmetric value props for new vs veteran players, +30% max power gap.
**Why:** Biggest retention risk is new players feeling locked out by veterans. Without this, the social layer (Phase 3) will feel punishing to latecomers. All 10 mechanisms together ensure a daily walker who joined yesterday beats a lapsed veteran.
**Alternatives rejected:** Single "level brackets" (too gamey, kills cross-level social); prestige-only resets (doesn't solve day-to-day snowball); no-competition-at-all (kills the social hook entirely).
**Affects:** `docs/04-engagement-mechanics.md`, all phase specs (especially Phase 3 & 4)
**Decided by:** User + Claude

## 2026-04-24 — Walk is heartbeat, game lives in-between

**Area:** Product / UX
**Decision:** During the walk, phone stays in pocket. Minimal audio cues only. The actual game experience happens *between* walks: passive Den progression, async events, evening recap, upgrade decisions.
**Why:** Dog safety first. Owner's eyes belong on the dog, not the screen. Also matches dog-walking reality — walks are short (~20 min), but the 23.5 hours between walks is where engagement can persist.
**Alternatives rejected:** Active in-walk gameplay (unsafe, distracting); full passive (removes agency entirely).
**Affects:** `docs/03-design-brief.md`, `docs/04-engagement-mechanics.md`, all UX decisions
**Decided by:** User

## 2026-04-24 — Spring-like tone, no dark mode

**Area:** Design / Tone
**Decision:** Warm, joyful, dog-centric visual and language. No dark mode. Colors: spring grass green (#2ECC71), sky blue (#3498DB), golden hour (#F39C12), dog brown (#8B6F47), warm white (#FAFAF8). Language: "claim/defend/protect," not "conquer/destroy/kill."
**Why:** Product positioning is "daily dog walk joy," not "neighborhood PvP battle." Dog owners want feel-good, not aggressive. Dark mode contradicts the spring/outdoor vibe.
**Alternatives rejected:** Dark mode toggle (dilutes identity); aggressive PvP language (wrong audience).
**Affects:** `docs/03-design-brief.md`, all UI copy, visual prototype
**Decided by:** User

## 2026-04-24 — Tech stack presumption (to confirm in Phase 0)

**Area:** Architecture
**Decision:** Presumed stack for the phased plan prompts: React Native + Expo + Supabase (PostGIS) + MapLibre. To be confirmed when Phase 0 actually begins.
**Why:** Expo gives fastest iteration; Supabase gives PostGIS + auth + realtime in one tier; MapLibre is OSS (no per-tile fees at scale).
**Alternatives rejected:** Flutter (smaller geo ecosystem); Firebase (no PostGIS); Mapbox (pricing cliff at scale).
**Affects:** `docs/01-prototype-plan-prompt.md` (architecture section). Locked in only when Phase 0 starts.
**Decided by:** Claude (to confirm with user)

---

<!-- Add new decisions above this line, newest first -->
