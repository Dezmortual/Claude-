# Manywright ad video (35s, 9:16)

- `manywright-ad.mp4`: the finished 1080x1920 ad with burned-in captions and the generated music + sound-effects track.
- `sfx-bed.wav`: that music + sound-effects track on its own, for mixing under a voiceover.
- `scene.html`: the animation (canvas, drawn in code; logo traced from `manywright-logo.png`).
- `render.js` / `sound.py`: rebuild the video and audio.

Rebuild from this folder:

```
python3 sound.py sfx-bed.wav
node render.js video clip.mp4 0 35
ffmpeg -i clip.mp4 -i sfx-bed.wav -c:v copy -c:a aac -shortest manywright-ad.mp4
```

The captions follow the voiceover script in `../manywright-one-brief.html`, one line per 5-second clip.
