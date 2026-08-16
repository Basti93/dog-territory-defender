# Phase 0 — Walking Skeleton

Minimal real prototype you can take on a walk. GPS tracking → map → territory claiming.

**What works:**
- ✅ Real GPS tracking (reads every 1-2 seconds)
- ✅ Live map showing your position + trail
- ✅ Distance + point count during walk
- ✅ Auto-detects when walk is "closeable" (start ≈ end, within 20m)
- ✅ Closes perimeter to claim territory
- ✅ Shows claimed territory polygon on map

**What's not in Phase 0:**
- ❌ Collectibles, enemies, leaderboards (Phase 2+)
- ❌ The Den, treats, buildings (Phase 1)
- ❌ Backend sync (Phase 3)
- ❌ Dark mode, animations (design polish)

---

## Running on your Android phone

### Prerequisites
- Node.js 16+ (`node -v`)
- Android phone with Android 8.0+ (API 26+)
- Android phone on same WiFi as your computer (or USB debug cable)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the Expo dev server
npm run android
```

The first run installs the Expo Go app on your phone. Subsequent runs let you reload the code instantly.

### First walk

1. **Open Expo Go app** on your phone (Expo should have installed it automatically)
2. **Tap the QR code** if prompted, or scan the QR code shown in terminal
3. **Accept location permissions** when prompted
4. **Tap "Start Walk"** — you'll see a blue dot (your position) on the map
5. **Walk around your block** (even 100-150 meters in a rough loop works)
6. **When you're close to where you started**, the button changes to **"✓ Close Territory"**
7. **Tap it** — you'll see your territory polygon on the map in green

Done! You've validated Phase 0: GPS works, territory claiming works.

---

## Architecture

```
App.tsx
├── React hooks: useState, useRef, useEffect
├── MapView (from react-native-maps)
├── GPS tracking (expo-location)
├── Utils:
│   ├── gps.ts: permission + location watching
│   ├── geometry.ts: distance, closure detection, polygon area
│   └── types.ts: TypeScript interfaces
└── UI:
    ├── Map region + pan/zoom
    ├── Trail polyline (blue dashed)
    ├── Territory polygon (green, if closed)
    └── Bottom controls: stats + buttons
```

**State flow:**
1. `startWalk()` → create Walk record, start location subscription
2. GPS callback → update locations array, pan map to current position
3. `canCloseWalk()` checks: ≥10 points AND distance(start, end) < 20m
4. `stopWalk()` → if closeable, `locationsToPolygon()` → show territory
5. `resetWalk()` → clear walk, ready for next one

---

## What to test on your first walk

- [ ] **GPS starts tracking** — blue dot appears on map
- [ ] **Trail appears** — blue dashed line follows your path
- [ ] **Distance updates** — increases as you walk
- [ ] **Closure detection works** — "Can close!" appears when you're near start
- [ ] **Territory is claimed** — green polygon shows your route when you close
- [ ] **Phone doesn't crash** — foreground location tracking is stable for 15+ minutes

---

## Next steps (Phase 1)

After validating GPS:
1. Add Den screen (3 buildings, passive treats tick)
2. Add post-walk celebration (confetti, +50 treats)
3. Add tab navigation (Map / Den / Dog / Settings)
4. Wire up basic backend (Supabase) for walk history

See [`openspec/specs/game-phases/spec.md`](openspec/specs/game-phases/spec.md) for the full Phase 0→1 transition.

---

## Debugging

**GPS not working?**
- Check location permissions: Settings → Apps → Dog Territory Defender → Permissions → Location
- Ensure "High accuracy" mode is on (Settings → Location)
- Try reloading: press 'r' in the Expo terminal

**Map shows wrong location?**
- Initial region defaults to Berlin (52.5, 13.4). First GPS fix will pan to your location.
- Drag map manually if needed.

**App crashes?**
- Check terminal for errors
- Restart Expo: Ctrl+C in terminal, then `npm run android` again

---

**Design North Star:** Every walk feels rewarding. Validation first.
