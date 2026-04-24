# Prompt 2 — Per-Phase Validation & Decision

Run this prompt **at the end of each phase** (Phase 0–4). It audits what you built, validates whether the phase's core hypothesis held up, and produces a clear continue / iterate / pivot / kill decision before you commit to the next phase.

This replaces the old "one big audit at the end" approach with a lean, phase-gated review. Cheaper to course-correct after Phase 1 than after Phase 4.

---

## PROMPT (copy from here)

You are the **product strategist + tech lead + growth advisor** for **Dog Territory Defender**, a location-based mobile game for urban dog owners. The team just completed **Phase X** (specify which: 0, 1, 2, 3, or 4) of the phased prototype plan in `01-prototype-plan-prompt.md`. Your job is to audit that phase honestly, validate its hypothesis, and make a clear decision about what's next.

### Inputs you will analyze
Before writing anything, actively inspect:
1. **The current prototype codebase** at `/Users/user/dog-territory-defender` — read what's actually built for this phase. Quote file paths.
2. **Phase X telemetry** — walks logged, sessions, retention curve, GPS accuracy, battery drain, crash rate, treat economy balance.
3. **Tester feedback** — qualitative responses from this phase's user test. What did they actually say?
4. **The original Phase X hypothesis & continue/kill thresholds** from `01-prototype-plan-prompt.md`.
5. **Competitive context** (only as relevant to this phase) — INTVL, Pokémon GO, Ingress, Walkr, Fi, Dogo. What did similar phases look like in their evolution?

### What I want you to produce

A single document with the following sections. Be specific, opinionated, and numeric.

#### 1. Phase X Audit
- **Hypothesis tested:** [restate exactly]
- **Did it validate?** Yes / No / Partial — with concrete evidence (numbers + quotes)
- **What works end-to-end** — list features with file/module references
- **What is fake / hardcoded / stubbed** — be honest, don't paper over gaps
- **Top 3 technical debts to fix before next phase** — with file paths and est. fix time
- **Top 3 UX smells observed** — with screen / flow references

#### 2. The Decision (pick exactly one)
- **CONTINUE** to Phase X+1 — hypothesis confirmed, advance as-planned
- **ITERATE** within Phase X — hypothesis partially confirmed, refine and re-test (max 2 weeks)
- **PIVOT** — hypothesis disconfirmed, but adjacent insight surfaced; propose new direction
- **KILL** — core assumption broken, recommend stopping or major rethink

For your chosen decision:
- Specific evidence behind the call
- Cost of the decision (time / money / opportunity)
- Risk if you're wrong (and how you'd notice)

#### 3. Hypothesis Re-evaluation
- Was the original hypothesis even the right one to test?
- Did the test surface any **bigger** hypothesis we should test next?
- Should the next phase's hypothesis be updated based on what we learned?

#### 4. Phase X+1 Readiness
- **Must-fix-first list** — what blocks the next phase from starting (specific, ordered)
- **Architecture changes** — does the codebase need refactoring before next phase?
- **Updated continue/kill thresholds** for Phase X+1 (the original numbers may need revision)
- **Cross-cutting work to bake in now** — battery, privacy, design system, etc.

#### 5. User & Market Signals
- **3 user quotes** that captured the phase (good or bad)
- **1 surprise** — something you didn't expect from this phase
- **Competitive update** — anything shifted in the market while we built this phase?

#### 6. Top 5 Immediate Actions
Ordered, with owner (Dev / Design / Founder), time estimate, success criterion. Specific enough to start tomorrow.

#### 7. Open Questions for the Founder
The 3 questions you cannot answer from the code + tests + market alone. Each one: why it matters, what changes if the answer is A vs B.

#### 8. "Ship This Week" Block
3 concrete deliverables for the next 7 days. Each one: who does it, what done looks like, what it unblocks.

---

### Style rules
- Read actual files before writing the audit. Quote paths and line numbers.
- Every recommendation must be **falsifiable or measurable** — no "consider" or "maybe."
- Numbers > adjectives. "47% of testers" beats "many testers."
- Be willing to recommend **kill** — bad phase reviews that recommend "continue" anyway are how products die slowly.
- Tone is honest but kind. We're auditing the work, not the team.

Begin by listing the files you will inspect for Phase X, then produce the document.
