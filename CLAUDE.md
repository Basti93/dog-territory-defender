# CLAUDE.md — Rules for Claude Code & AI Coding Agent Sessions

This file tells Claude (and any AI coding agent) how to collaborate on **Dog Territory Defender**. Read this at the start of every session.

---

## Project essentials

- **Product:** Location-based mobile game for urban dog owners. Spring-like, joyful. Cookie-clicker background loop. Anti-snowball social layer.
- **Source of truth for game design:** [openspec/](openspec/) (`openspec/config.yaml`, `openspec/specs/`).
- **Status tracker and architecture:** [README.md](README.md) — check Project Status first; its Architecture section is authoritative.
- **Master build plan:** [openspec/specs/game-phases/spec.md](openspec/specs/game-phases/spec.md) (5-phase lean-startup plan, phase-gating rule, per-phase validation). **Do not deviate from the phase-gated approach.**
- **Visual direction:** [openspec/specs/visual-design/spec.md](openspec/specs/visual-design/spec.md).
- **Engagement mechanics:** [den-economy](openspec/specs/den-economy/spec.md) (The Den), [pack-collection](openspec/specs/pack-collection/spec.md) (The Pack), [anti-snowball](openspec/specs/anti-snowball/spec.md) (10 mechanisms). Numeric thresholds there are load-bearing; re-read before touching treats, Den, building levels, Pack, or anti-snowball.
- **Decisions log:** `openspec/changes/archive/` (each change's `proposal.md` Why/Alternatives and `design.md` Decisions). Presentation decisions go in the open change's log, see Process tiers.
- **Visual prototype:** [prototype/](prototype/) — clickable HTML demo, a design spec, not a starter codebase. Recreate its visuals and behavior in React Native; never import its React-Babel-standalone structure into `src/`. Deferred features are listed in the `PARKED FOR LATER PHASES` block atop `prototype/Dog Territory Defender.html`.

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

## Process tiers

Classify each request first. Phase gating applies to all tiers.

- **Tier A, game design** (mechanics, economy numbers, phase assignments, anti-snowball, Den/Pack rules, new capabilities with player-facing rules): OpenSpec change (`/opsx:explore` → `/opsx:propose` → `/opsx:apply` → `/opsx:archive`/`/opsx:sync`) is mandatory. Never edit `openspec/specs/` directly.
- **Tier B, presentation** (UI layout, animation, art, copy, tuning constants, icons, polish): straight to code. Append any decision worth remembering as a dated bullet to the "Decisions log (presentation)" section at the end of `openspec/changes/buddy-comes-alive/design.md` (the one place for these, for now; create the section on first use).
- **Tier C, bug fixes, refactors, docs**: just do it, with `npm test` and `npx tsc --noEmit` green.

A small numeric tweak that changes game balance is Tier A; log it in an open change. Never silently change a load-bearing threshold.

**Phases:** Default phase is Phase 1 (in progress). Only ask when a request clearly belongs to a later phase; if out-of-phase, push back kindly and park it. Scope creep is how prototypes die.

## How sessions are run

The main Claude session (Fable/Opus) orchestrates only: analyses, briefs, integrates, verifies, reports. Implementation, research, and review go to subagents on `sonnet` (role agents in `.claude/agents/` are fine). Main-thread tool use stays cheap: git status, tsc, jest, small greps.

- `game-master`: once per new player-facing feature. `senior-architect`: only for cross-cutting changes. One reviewer pass before each commit.
- Agents cannot test on a device: every UI change ends with a short "check on device" list for the owner.

## Art & game feel

- Style: pre-rendered 3D clay sprites animated in code. See `openspec/changes/buddy-comes-alive/design.md` and `assets/art/README.md`.
- Art comes from `scripts/blender/` (headless Blender, deterministic; preferred for buildings/icons) or `scripts/generateArt.mjs` (Gemini/OpenAI; for Buddy likeness from a photo).
- Art slots are read through `src/art/artAssets.ts`'s `artOr()`.
- No new native dependencies without the owner's go-ahead (each forces a dev-client rebuild).
- game-master's anti-guilt rules for Buddy are binding: Buddy is never sad, hungry, neglected, or nagging.

---

## Core responsibilities

1. **No silent drift.** When a change alters the plan, update the doc in the same turn: phase assignment, mechanics, or tone rules via an OpenSpec change (Tier A); README status when a phase hypothesis is validated/invalidated; README folder map and `prototype/README.md` when files are added or renamed; tech/architecture decisions in the introducing change's `design.md`.
2. **Memorize durable decisions** to the memory system (user, project, feedback, reference types). The archive is the authoritative log; memory is the quick-recall cache and can be stale, so verify against files.
3. **Don't guess, check.** Verify files with `ls`/Glob, read numeric thresholds from the source spec, and check the den/pack/anti-snowball specs before proposing a mechanic. When ambiguity arises, ask the user.
4. **Prefer editing over creating** files; keep docs concise enough to read end-to-end.
5. **After a phase is implemented,** run the "Per-Phase Validation Process" in the game-phases spec before advancing.

## Tone

- Spring-like, friendly, joyful, dog-centric; warm and celebratory, not transactional. Match existing files.
- Never "conquer," "destroy," "kill," "battle." Use "claim," "defend," "protect."
- No dark mode. No emoji-heavy UI or aggressive monetization.
- Use the design tokens in the prototype (`T.green`, `T.blue`, ...) and the visual-design spec; no new colors without updating that spec's token list and explaining why in the introducing change.

## Anti-patterns

- Building later-phase features early
- Editing `openspec/specs/` outside the OpenSpec flow
- Forgetting README status after a phase completes
- Aggressive/competitive language
- Adding a native dependency without the owner's go-ahead
- Creating a new `.md` file when an existing one could be extended

---

**Remember:** The phased plan is sacred. The tone is spring. The dog is the star. The walk is the heartbeat.
