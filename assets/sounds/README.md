# UI sounds

Most files here are synthesized by `scripts/soundSynth.cjs` (pure Node, no samples).
The Buddy tap barks (`buddy-1/2/3.wav`) come from a small formant synthesizer.

## Use your own recording

Any WAV with the same file name replaces the synthesized one. Preferred format:
22.05 kHz, mono, 16-bit (44.1 kHz also works). To use your own dog, record and
save as `buddy-1.wav`, `buddy-2.wav`, `buddy-3.wav` in this folder.

## Do not lose it on regenerate

`node scripts/generateSounds.mjs` rewrites ALL synthesized files. List the names of
files you want to keep in `keep.json` (no extension) and they are skipped:

    ["buddy-1", "buddy-2", "buddy-3"]

`node scripts/generateSounds.mjs --ambient` only rebuilds `ambient-musicbox.wav`.
