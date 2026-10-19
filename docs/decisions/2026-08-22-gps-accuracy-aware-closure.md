# GPS accuracy filter and accuracy-aware closure (2026-08-22, closure part superseded)
**Why:** (1) Every raw fix was used regardless of accuracy, so one bad reading (205m backgrounded, also tree cover/urban canyon) caused trail jumps and could corrupt closure/area. (2) The flat 20m closure radius ignored real accuracy (commonly +-10-25m), so a walker who truly returned to start could miss closing. Distinct from background tracking, which is about fixes arriving at all.
**Decisions:**
- `Location` gains `accuracy: number` (meters, from `position.coords.accuracy`), additive, populated in `src/utils/gps.ts` (the only construction site once mock walks were removed). Missing accuracy falls back to `MAX_ACCEPTABLE_ACCURACY_M`.
- Reject threshold **30m**, applied in `gps.ts` before a fix reaches the app: `accuracy > 30` is logged (`GPS_FIX_REJECTED` with accuracy, lat, lon) and dropped (never in `walk.locations`, never on the map). Chosen against observed foreground ~9-25m (pass) and backgrounded ~205m (reject). New number, not derived from any spec.
- Closure radius **`max(firstAccuracy + lastAccuracy + 10, 100)` m**, replacing flat 20. Emulator GPX playback with ~5m accuracy still missed 20m repeatedly (26m, 18.7m misses) because return-to-start rarely hits the first fix exactly. A pure sum formula would give ~20-26m, barely different. The 100m floor makes the common case forgiving; the sum term widens it under poor accuracy (two ~60m fixes exceed 100); `+10` margin because accuracy is a reported uncertainty radius, not a hard bound. Both numbers are tunable constants beside `canCloseWalk`/`gps.ts`, not user-configurable.
- Trade-off accepted: rejecting fixes can leave fewer than the >=10 points needed to close in bad signal; End Walk remains available. The 100m floor deliberately loosens the original 20m rule (revisit downward if territories feel too easy).
**Rejected:**
- Kalman filtering / sensor fusion / smoothing: rejection is simpler and adequate; revisit only if insufficient.
- Pure accuracy-sum closure radius, because it would not have fixed the observed near-misses.
- Changing `calculatePolygonArea`: filtering upstream improves its input.
**Superseded:** the `canCloseWalk` loop-closure gate was deleted; reward eligibility is now ground covered (see `docs/specs/walk-lifecycle.md`). The 30m accuracy filter and `Location.accuracy` remain in `src/utils/gps.ts`.
**Links:** `src/utils/gps.ts`, `docs/specs/walk-lifecycle.md`

**Updated 2026-10-19:** the reject threshold is now 50m for trail, distance, movement and auto-finish; Home Range and corner cells still paint only from fixes of 30m or better (pocket fixes are 30-50m). See `docs/specs/walk-lifecycle.md` "GPS fix accuracy".
