# UI sounds

Most files are synthesized by `scripts/soundSynth.cjs` (pure Node, no samples); the Buddy tap barks (`buddy-1/2/3.wav`) come from a small formant synthesizer.

- **Own recording:** any WAV with the same file name replaces the synthesized one. Preferred 22.05 kHz, mono, 16-bit (44.1 kHz works). Record your dog as `buddy-1|2|3.wav` here.
- **Regenerate:** `node scripts/generateSounds.mjs` rewrites ALL synthesized files; list names to keep (no extension) in `keep.json`, e.g. `["buddy-1", "buddy-2", "buddy-3"]`. `--ambient` rebuilds only `ambient-musicbox.wav`.
- **Import (macOS):** `scripts/importSound.sh ~/Downloads/puppy-bark.mp3 buddy-1` converts to the app format, trims leading silence, caps at 1.5 s and protects the cue in `keep.json`. Free sources usable without attribution: Pixabay, Mixkit; on Freesound use the CC0 filter. Restart the app afterwards (Metro caches assets).
- **Third party:** `buddy-1|2|3.wav` derive from "George vuf 1996.ogg" (public domain, https://commons.wikimedia.org/wiki/File:George_vuf_1996.ogg); variants: original, +12% pitch, double bark.
