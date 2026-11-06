# Recording the Social and email page

Everything shown inside and around the phone in `SocialReel` comes from the live page
https://manywright.com/services/social-and-email/ in Playwright's iPhone 15 Pro emulation (393x740 web view, 3x).

1. `node record.js` — drives a real, timed session (scrolls, taps "See packages and prices", opens two FAQs,
   taps "Request a proposal") at 18% speed with the page's CSS animations slowed to match, capturing
   full-density frames. Writes `frames/`, `frames.json` (session timestamps) and `events.json` (taps + element rects).
2. Turn the frames into a constant-60 fps video (pad to an even width):
   build an ffmpeg concat list from `frames.json`, then
   `ffmpeg -f concat -safe 0 -i concat.txt -vf "fps=60,pad=1180:2220:0:0:color=white,format=yuv420p" -c:v libx264 -crf 14 recording.mp4`
3. `node assets.js`, `node roles.js` — element screenshots of the page (the pieces that break out of the phone).
4. `node rects2.js`, `node hires.js` — price/limits rows at 8x for the large price moments.
5. Copy `recording.mp4`, `events.json` and the pieces into `public/social/`, then `npm run music:social && npm run render:social`.

`public/social/recording.mp4` is not committed (18 MB); re-create it with steps 1–2.
