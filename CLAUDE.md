# CLAUDE.md — rules for Claude Code sessions on Tails Up (Dog Territory Defender)

Location-based dog-walk game: spring-like, joyful, cookie-clicker loop, anti-snowball social layer. Read this at session start.

## Where things live
- [README.md](README.md): setup, build/deploy commands, architecture map, current status (authoritative).
- `docs/specs/`: game design source of truth (`den-economy`, `pack-collection`, `anti-snowball`, `walk-lifecycle`, `home-range`, `visual-design`, `game-backlog` = agile menu + known stubs). Numeric thresholds are load-bearing: re-read before touching treats, Den, buildings, Pack, anti-snowball.
- `docs/decisions/LOG.md`: dated decision bullets; `docs/decisions/<change>.md`: one-page history per past change. Read before reopening a topic.
- `prototype/`: clickable HTML design spec. Recreate its visuals in React Native; never import its structure into `src/`.

## Commands and gates
```bash
npm install            # legacy-peer-deps=true in .npmrc
npm run check          # tsc --noEmit && jest --silent: the gate, green before every commit
npm run start          # expo start; android / ios / web also exist
```
Expo SDK 54, RN 0.81, React 19, TS 5.9 strict. Dev client required (not Expo Go). No lint script; don't invent one.

## Work kinds (all straight to code, gate green)
- **Game design** (mechanics, economy numbers, anti-snowball, Den/Pack rules, new player-facing rules): `game-master` fun check first, then update `docs/specs/` in the same commit. Never silently change a load-bearing threshold; a balance tweak gets a dated LOG.md bullet with old value, new value, why.
- **Presentation** (UI, animation, art, copy, tuning constants, polish): straight to code; decisions worth keeping go to LOG.md.
- **Bug fixes, refactors, docs**: just do it.

## Session model
The main session (Fable/Opus) only orchestrates: analyses, briefs, integrates, verifies, reports. Implementation, research and review go to subagents on `sonnet` (role agents in `.claude/agents/`). Main-thread tool use stays cheap: git status, tsc, jest, small greps.
- `game-master`: once per new player-facing feature. `senior-architect`: only for cross-cutting changes. One reviewer pass before each commit.
- Agents cannot test on a device: every UI change ends with a short "check on device" list for the owner.
- Claude may run installs, EAS builds, OTA publishes and the server deploy; installing on a phone (Xcode, APK) is the owner's job.

## Art and game feel
- Pre-rendered 3D clay sprites animated in code. Art comes from `scripts/blender/` (headless Blender, deterministic; preferred for buildings/icons) or `scripts/generateArt.mjs` (image API; Buddy likeness from a photo). Details: `assets/art/README.md`, `docs/decisions/buddy-comes-alive.md`.
- Read art slots through `src/art/artAssets.ts` `artOr()`.
- No new native dependency without the owner's go-ahead (each forces a dev-client rebuild).
- Anti-guilt rules are binding: Buddy is never sad, hungry, neglected or nagging; no days-since-last-open numbers or guilt copy.

## Tone
- Spring-like, friendly, joyful, dog-centric, warm; match existing copy. Say "claim", "defend", "protect"; never "conquer", "destroy", "kill", "battle".
- No dark mode, no emoji-heavy UI, no aggressive monetization.
- Use design tokens (`src/ui/tokens`, `T.green`, `T.blue` in the prototype); a new colour needs `docs/specs/visual-design.md` updated and a LOG.md reason.

## Docs stay compact
Budgets: CLAUDE.md ≤ 60 lines; README.md ≤ 80; each `docs/specs/*.md` ≤ 100; `docs/decisions/LOG.md` keeps the newest ~40 bullets, older ones condensed to one line per month under "Earlier".
- No silent drift: a change that alters a mechanic, status, folder map or decision updates its doc in the same turn (specs, README status, LOG.md).
- Status lines are replaced, not appended; README is not a changelog (history lives in LOG.md and git).
- No new `.md` file when an existing one fits; edit instead of creating.
- Don't guess, check: `ls`/Glob paths, read thresholds from the spec, ask when ambiguous.
- Memory is a quick-recall cache and can be stale; `docs/` is authoritative.
- Every agent checks these budgets (`wc -l`) before finishing.

**The backlog is a menu, not a gate. The tone is spring. The dog is the star. The walk is the heartbeat.**
