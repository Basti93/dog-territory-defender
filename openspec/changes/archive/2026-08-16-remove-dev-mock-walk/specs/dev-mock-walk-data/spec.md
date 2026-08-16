## REMOVED Requirements

### Requirement: Mock closed-loop walk fixture
**Reason**: JS-level canned fixtures never exercise the real Android location provider, making them unable to validate the things now under test (background tracking, foreground service behavior, real GPS accuracy). Superseded by the Android Emulator's built-in location/route simulator, which goes through the real location stack.
**Migration**: Use Android Studio's Emulator → Extended Controls → Location → Routes, importing `testing/munich-route.gpx` (or any GPX route) for a closed-loop test; use the single-point location setter for other scenarios.

### Requirement: Mock open walk fixture
**Reason**: Same as above.
**Migration**: Stop the emulator's route playback partway through (or set a single point that doesn't return near the start) to simulate an open/incomplete walk.

### Requirement: Mock data unreachable in production
**Reason**: The capability itself is being removed, so there's nothing left to gate.
**Migration**: N/A.
