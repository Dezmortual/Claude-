// One cue sheet drives both the picture (BrandFilm.tsx) and the sound (scripts/brand-music.mjs),
// so every scribble, pop, flip and stamp is heard on the frame it happens. Times in seconds.
// The scenes are authored on a 40 s timeline. HOLDS then pause the story on each finished page so it can be
// read: [authoring time, extra seconds]. map() turns an authoring time into film time (used by the sound);
// unmap() turns film time back into authoring time (used by the picture; it stands still during a hold).
export const AUTHOR_DUR = 40;
export const HOLDS = [[3.7, 2.5], [7.6, 3.5], [11.9, 2.5], [14.6, 2.0], [17.9, 2.5], [21.6, 3.0], [25.6, 2.5], [29.6, 3.5], [32.6, 3.0], [35.6, 2.5], [39.0, 2.5]];
export const DUR = AUTHOR_DUR + HOLDS.reduce((s, h) => s + h[1], 0); // 70 s
export const BPM = 120;
export const map = (t) => t + HOLDS.filter(([hp]) => hp <= t).reduce((s, h) => s + h[1], 0);
export const unmap = (T) => { let cum = 0; for (const [hp, ex] of HOLDS) { if (T < hp + cum) return T - cum; if (T < hp + cum + ex) return hp; cum += ex; } return T - cum; };

// scene boundaries
export const SCENES = {
  hook: [0, 4], whofor: [4, 8], concepts: [8, 12], choose: [12, 15], revise: [15, 18],
  formats: [18, 22], palette: [22, 26], kit: [26, 30], prices: [30, 33], own: [33, 36], end: [36, 40],
};

// pencil strokes and hand-lettering: [start, duration]; "write" is lettering, "draw" is a drawing, "marker" a fill
export const DRAW = {
  hookFrame: [0.5, 0.8, "draw"], headline: [1.0, 1.6, "write"],
  whoforHead: [4.2, 1.0, "write"], sign: [5.0, 0.45, "draw"], van: [5.5, 0.45, "draw"], website: [6.0, 0.45, "draw"],
  phone: [6.55, 0.35, "draw"], shirt: [7.0, 0.35, "draw"],
  clipboard: [8.1, 0.5, "draw"], conceptsHead: [9.3, 0.55, "write"],
  conceptA: [9.9, 0.45, "draw"], conceptB: [10.4, 0.45, "draw"], conceptC: [10.9, 0.45, "draw"],
  chooseRing: [12.2, 0.45, "draw"], chooseText: [12.8, 0.6, "write"],
  reviseHead: [15.1, 0.6, "write"], redraw1: [16.4, 0.4, "draw"], redraw2: [17.35, 0.35, "draw"],
  formatsHead: [18.2, 0.5, "write"],
  paletteHead: [22.2, 0.5, "write"], sw0: [22.9, 0.25, "marker"], sw1: [23.2, 0.25, "marker"], sw2: [23.5, 0.25, "marker"], sw3: [23.8, 0.25, "marker"], aa: [24.2, 0.6, "draw"],
  kitHead: [26.1, 0.45, "write"], card: [28.0, 0.25, "draw"], social: [28.3, 0.25, "draw"], signature: [28.6, 0.25, "draw"], invoice: [28.9, 0.25, "draw"],
  tagStarter: [30.2, 0.4, "draw"], tagKit: [31.1, 0.4, "draw"],
  ownQ: [33.1, 0.6, "write"], ownYes: [34.0, 0.35, "marker"],
  logoSketch: [36.2, 0.8, "draw"], logoInk: [37.0, 0.4, "marker"], endLine: [37.4, 0.8, "write"],
};
export const POP = [2.8, 3.05, 3.2, 3.35, 3.5, 5.45, 5.95, 6.45, 6.9, 7.2, 8.7, 8.9, 9.1, 10.35, 10.85, 11.35, 11.5, 15.8, 16.9,
  20.1, 20.35, 20.6, 20.85, 21.1, 24.9, 28.25, 28.55, 28.85, 29.15, 30.65, 31.55, 34.8, 38.3];
export const FLIP = [3.7, 14.6, 21.6, 29.6, 35.6];
export const PAGE_TICKS = [26.7, 26.9, 27.1, 27.3, 27.5]; // the brand guide's pages flicking
export const ERASE = [[7.6, 0.4], [16.0, 0.4], [17.0, 0.35], [25.6, 0.4]];
export const CRUMPLE = [13.4, 13.6];
export const WHOOSH = [0.0, 13.75, 17.9, 32.6];
export const STAMP = [18.9, 19.3, 19.7];
export const COIN = [30.7, 31.6];
export const BOING = [0.45, 34.1, 38.8];
export const SAD = [7.05];
export const DING = [12.7, 17.65, 38.3];
export const CONFETTI = [34.1];
