## Why

The project's planning knowledge (phased build plan, per-phase validation process, visual direction, and the Den/Pack/anti-snowball engagement mechanics with their load-bearing numeric thresholds) currently lives in five free-form prompt/brief documents under `docs/`. Now that the project has adopted OpenSpec for spec-driven development, that content needs to live as structured, queryable capability specs under `openspec/specs/` so it is the single source of truth, stays consistent with the OpenSpec workflow (propose → specs → apply → archive), and the ad-hoc `docs/*.md` files can be retired.

## What Changes

- Extract the 5-phase lean-startup build plan (`docs/01-prototype-plan-prompt.md`) into durable, numeric, testable requirements: one requirement per phase (hypothesis, minimum feature set, acceptance criteria, test protocol, continue/iterate/kill thresholds), plus the phase-gating rule and cross-cutting technical constraints (battery, privacy, audio-first interaction).
- Extract the per-phase validation/audit process (`docs/02-post-prototype-investigation-prompt.md`) into a requirement describing the mandatory end-of-phase audit (sections it must cover, and the CONTINUE/ITERATE/PIVOT/KILL decision it must produce).
- Extract the visual direction and tone rules (`docs/03-design-brief.md`) into a `visual-design` capability: design tokens (exact hex codes), typography rules, the four key screens with intent, interaction/delight moments, the "what we're not doing" exclusion list (no dark mode, no PvP language, no gamey chrome, no dog photos), and success criteria.
- Extract The Den (`docs/04-engagement-mechanics.md` Part 1) into a `den-economy` capability: treat currency mechanics, the 10 buildings with their exact effects and unlock levels, the 100-level/exponential-cost/soft-cap-at-L50 progression rule.
- Extract The Pack (`docs/04-engagement-mechanics.md` Part 2) into a `pack-collection` capability: recruitment tiers (common/rare/legendary) and their exact bonus ranges, and Pack-specific anti-snowball limits (30% total contribution cap, common dogs 80% as effective as legendary, 8-slot cap).
- Extract the 10 anti-snowball mechanisms (`docs/04-engagement-mechanics.md` Part 3) into an `anti-snowball` capability, preserving every numeric threshold exactly (e.g. soft caps at +50% above L50, ~30% max L100-vs-L1 advantage, Beginner's Luck 2x for 30 days, mentor +5% treats, seasonal resets every 3 months).
- Fold the phase-to-mechanic rollout mapping (`docs/04-engagement-mechanics.md` Part 4) into the `game-phases` capability as a requirement cross-referencing `den-economy`, `pack-collection`, and `anti-snowball`.
- Preserve the illustrative "Spring-Themed Engagement Examples" narrative (`docs/04-engagement-mechanics.md` Part 5) and the design north star quotes as descriptive prose (Purpose sections / scenario framing) rather than as formal requirements — they are flavor and intent, not testable behavior.
- Update `CLAUDE.md` references from `docs/01`–`docs/05` to the corresponding `openspec/specs/<capability>/spec.md` paths.
- Update `README.md` if it links to any `docs/*.md` path being removed.
- Delete `docs/01-prototype-plan-prompt.md`, `docs/02-post-prototype-investigation-prompt.md`, `docs/03-design-brief.md`, `docs/04-engagement-mechanics.md`, `docs/05-design-update-prompt.md` once their content is captured. Remove the `docs/` directory if it ends up empty.
- Leave `DECISIONS.md`, `README.md` (status content), and `prototype/` untouched in substance — this is a documentation restructuring, not a product or process change.

## Capabilities

### New Capabilities
- `game-phases`: The 5-phase lean-startup build plan (Phase 0 Walking Skeleton → Phase 4 Long-Term Hooks), the phase-gating rule, cross-cutting technical constraints (battery, privacy, audio-first interaction), the phase-to-mechanic rollout mapping, and the mandatory end-of-phase validation/audit process.
- `visual-design`: Design tokens, typography, tone/language rules, key screen intents, interaction moments, exclusions (no dark mode, no PvP language, etc.), and phase-scoped visual delivery.
- `den-economy`: The Den — treats currency, the 10 buildings, their effects, unlock levels, and the 100-level soft-cap-at-L50 progression rule.
- `pack-collection`: The Pack — AI dog companion recruitment tiers and Pack-specific anti-snowball limits.
- `anti-snowball`: The 10 cross-cutting anti-snowball mechanisms and their exact numeric thresholds.

### Modified Capabilities
(none — `openspec/specs/` is currently empty)

## Impact

- Affected: `openspec/specs/game-phases/spec.md`, `openspec/specs/visual-design/spec.md`, `openspec/specs/den-economy/spec.md`, `openspec/specs/pack-collection/spec.md`, `openspec/specs/anti-snowball/spec.md` (new files).
- Affected: `CLAUDE.md` (doc references updated to point at specs), `README.md` (dead-link check).
- Removed: `docs/01-prototype-plan-prompt.md`, `docs/02-post-prototype-investigation-prompt.md`, `docs/03-design-brief.md`, `docs/04-engagement-mechanics.md`, `docs/05-design-update-prompt.md`, and the `docs/` directory if empty afterward.
- No code, app behavior, or `prototype/` changes. No numeric threshold is changed — only relocated and preserved exactly.
