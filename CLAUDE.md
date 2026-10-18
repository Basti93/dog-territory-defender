# CLAUDE.md — Rules for Claude Code & AI Coding Agent Sessions

This file tells Claude (and any AI coding agent) how to collaborate on **Dog Territory Defender**. Read this at the start of every session.

---

## Project essentials

- **Product:** Location-based mobile game for urban dog owners. Spring-like, joyful. Cookie-clicker background loop. Anti-snowball social layer.
- **Source of truth for game design:** [docs/specs/](docs/specs/) (plain Markdown, one file per topic). Edit them directly when the design changes; keep the numeric thresholds and the reasoning in the same commit.
- **Status tracker and architecture:** [README.md](README.md) — check Project Status first; its Architecture section is authoritative.
- **Agile backlog:** [docs/specs/game-backlog.md](docs/specs/game-backlog.md) (game ideas by theme, cross-cutting constraints, known stubs). Work is pulled from it by owner feedback and fun; no phase gates.
- **Visual direction:** [docs/specs/visual-design.md](docs/specs/visual-design.md).
- **Engagement mechanics:** [den-economy](docs/specs/den-economy.md) (The Den), [pack-collection](docs/specs/pack-collection.md) (The Pack), [anti-snowball](docs/specs/anti-snowball.md) (10 mechanisms). Numeric thresholds there are load-bearing; re-read before touching treats, Den, building levels, Pack, or anti-snowball.
- **Decisions log:** `docs/decisions/` (one folder per past change with `proposal.md` Why/Alternatives and `design.md` Decisions; historical, read before reopening a topic). New decisions go into `docs/decisions/LOG.md` as dated bullets.
- **Visual prototype:** [prototype/](prototype/) — clickable HTML demo, a design spec, not a starter codebase. Recreate its visuals and behavior in React Native; never import its React-Babel-standalone structure into `src/`. Deferred features are listed in the `BACKLOG IDEAS (not built yet)` block atop `prototype/Dog Territory Defender.html`.

---

## Dev commands

```bash
npm install          # legacy-peer-deps=true set in .npmrc
npm test             # jest, the test gate
npx tsc --noEmit     # type gate (strict); run both before every commit
npm run start        # expo start (also: android, ios, web)
```

Stack: Expo SDK 54, React Native 0.81, React 19, TypeScript 5.9. Dev client required (not Expo Go); see README Setup. No lint script exists; don't invent one.

## Architecture

[README.md](README.md)'s Architecture section is the authoritative description; don't duplicate it here. Key folders:

- `src/components` (screens, `buddy/`, `den/`), `src/economy` (tunable config + pure formulas), `src/storage` (repository layer, in-memory fakes for tests)
- `src/notifications`, `src/utils` (GPS, geometry, territory logic), `src/web` (Leaflet map HTML in a WebView)
- `src/buddy` (Buddy appearance/animation), `src/ui` (shared UI primitives), `src/art` (art slot access)
- `scripts/` (art generation: `blender/`, `generateArt.mjs`), `assets/art/`, `testing/` (GPX routes)

---

## How work is classified

No formal spec process. Three kinds of work, all straight to code with `npm test` and `npx tsc --noEmit` green:

- **Game design** (mechanics, economy numbers, anti-snowball, Den/Pack rules, new player-facing rules): first get a `game-master` fun check, then update the relevant file in `docs/specs/` in the same commit as the code. Never silently change a load-bearing threshold; a balance tweak gets a dated bullet in `docs/decisions/LOG.md` with the old and new value and why.
- **Presentation** (UI layout, animation, art, copy, tuning constants, icons, polish): straight to code. Decisions worth remembering go to `docs/decisions/LOG.md`.
- **Bug fixes, refactors, docs**: just do it.

## How sessions are run

The main Claude session (Fable/Opus) orchestrates only: analyses, briefs, integrates, verifies, reports. Implementation, research, and review go to subagents on `sonnet` (role agents in `.claude/agents/` are fine). Main-thread tool use stays cheap: git status, tsc, jest, small greps.

- `game-master`: once per new player-facing feature. `senior-architect`: only for cross-cutting changes. One reviewer pass before each commit.
- Agents cannot test on a device: every UI change ends with a short "check on device" list for the owner.

## Art & game feel

- Style: pre-rendered 3D clay sprites animated in code. See `docs/decisions/buddy-comes-alive/design.md` and `assets/art/README.md`.
- Art comes from `scripts/blender/` (headless Blender, deterministic; preferred for buildings/icons) or `scripts/generateArt.mjs` (Gemini/OpenAI; for Buddy likeness from a photo).
- Art slots are read through `src/art/artAssets.ts`'s `artOr()`.
- No new native dependencies without the owner's go-ahead (each forces a dev-client rebuild).
- game-master's anti-guilt rules for Buddy are binding: Buddy is never sad, hungry, neglected, or nagging.

---

## Core responsibilities

1. **No silent drift.** When a change alters the plan, update the doc in the same turn: mechanics or tone rules in `docs/specs/`; README status when it changes; README folder map and `prototype/README.md` when files are added or renamed; tech/architecture decisions in `docs/decisions/LOG.md`.
2. **Memorize durable decisions** to the memory system (user, project, feedback, reference types). `docs/` is the authoritative log; memory is the quick-recall cache and can be stale, so verify against files.
3. **Don't guess, check.** Verify files with `ls`/Glob, read numeric thresholds from the source spec, and check the den/pack/anti-snowball specs before proposing a mechanic. When ambiguity arises, ask the user.
4. **Prefer editing over creating** files; keep docs concise enough to read end-to-end.

## Tone

- Spring-like, friendly, joyful, dog-centric; warm and celebratory, not transactional. Match existing files.
- Never "conquer," "destroy," "kill," "battle." Use "claim," "defend," "protect."
- No dark mode. No emoji-heavy UI or aggressive monetization.
- Use the design tokens in the prototype (`T.green`, `T.blue`, ...) and the visual-design spec; no new colors without updating that spec's token list and explaining why in `docs/decisions/LOG.md`.

## Anti-patterns

- Changing a mechanic or threshold in code without updating `docs/specs/`
- Forgetting README status after a notable slice ships
- Aggressive/competitive language
- Adding a native dependency without the owner's go-ahead
- Creating a new `.md` file when an existing one could be extended

---

**Remember:** The backlog is a menu, not a gate. The tone is spring. The dog is the star. The walk is the heartbeat.
