# Quick Start — 5 minutes to your first walk

## Step 1: Install

```bash
cd phase-0-app
npm install
```

This installs React Native, Expo, location tracking, and map libraries.

## Step 2: Run on Android

```bash
npm run android
```

This:
1. Starts the Expo dev server
2. Opens Expo Go app on your phone (or prompts to install)
3. Loads the app

## Step 3: Accept permissions

When the app opens, **allow location access** (for GPS tracking).

## Step 4: First walk

1. Tap **"Start Walk"**
2. Walk around your block (~100-150m in a loop, even a rough one)
3. When you're close to where you started, button says **"✓ Close Territory"**
4. Tap it → territory appears as green polygon on map

**Done!** You've validated Phase 0: GPS tracking, map, territory claiming all work.

---

## What you're testing

- ✅ GPS accuracy in your neighborhood
- ✅ Battery drain (how much % per 30 min walk?)
- ✅ Can you actually close a perimeter by walking?
- ✅ Is the "within 20m" closure threshold reasonable?

## Next

After a walk or two, we'll know:
- GPS feels good? → proceed to Phase 1 (Den, treats)
- GPS is jittery? → adjust accuracy/interval settings
- 20m threshold too tight? → we'll adjust it

See `README.md` for detailed docs.
