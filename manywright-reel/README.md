# Manywright motion reel

A 15-second, 1920×1080, 60 fps brand reel for manywright.com, built with
[Remotion](https://www.remotion.dev) and a soundtrack synthesized in plain Node.

- `scripts/music.mjs` writes `public/music.wav`: 128 BPM, A minor, 8 bars = 15 s exactly.
- `src/lib.tsx` holds the shared beat grid (`b(n)` = frame of beat n), palette and helpers.
- `src/scenes.tsx` has the seven scenes, cut on downbeats:
  hook (0–4), disciplines (4–12), shapes (12–16), camera (16–20), colour (20–24), build (24–28), land (28–32).

```
npm install
npm run music      # regenerate the soundtrack
npm run studio     # preview
npm run render     # out/manywright-reel.mp4
```

`remotion.config.ts` points at the headless Chromium in this environment; change
`setBrowserExecutable` (or delete it to let Remotion download one) elsewhere.
