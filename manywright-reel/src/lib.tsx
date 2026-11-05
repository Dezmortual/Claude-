import React from "react";
import { Easing, interpolate, random } from "remotion";

// ---- timing: 128 BPM at 60 fps. One beat = 28.125 frames; 32 beats = 900 frames = 15 s.
export const FPS = 60;
export const BPM = 128;
export const BF = (FPS * 60) / BPM;
export const b = (n: number) => Math.round(n * BF);
export const DURATION = 900;

// ---- brand palette (from the Manywright explainer) plus a cobalt for colour play
export const C = {
  navy: "#0A1F33",
  deep: "#06131F",
  amber: "#F2B84B",
  coral: "#E8775E",
  ice: "#E4EDF3",
  cobalt: "#2E5BFF",
  muted: "#8EA7BB",
};
export const DISPLAY = "'Archivo', 'Arial Narrow', Arial, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

export const outExpo = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const inExpo = Easing.bezier(0.7, 0, 0.84, 0);

export const ip = (f: number, i: number[], o: number[], easing: (t: number) => number = outExpo) =>
  interpolate(f, i, o, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

export const vf = (w: number, g: number) => `'wdth' ${w.toFixed(1)}, 'wght' ${g.toFixed(0)}`;

// approximate cap width (em per char) of Archivo at wght ~900 for a given wdth
const k = (w: number) => 0.52 + ((w - 62) * 0.43) / 63;
export const fit = (text: string, w: number, target: number, max: number) => Math.min(max, target / (text.length * k(w)));

// decaying screen shake from a list of [startFrame, duration, amplitudePx]
export const shake = (f: number, events: [number, number, number][]) => {
  let x = 0, y = 0, r = 0;
  for (const [at, dur, amp] of events) {
    if (f >= at && f < at + dur) {
      const d = Math.pow(1 - (f - at) / dur, 2);
      x += (random(`x${f}-${at}`) - 0.5) * 2 * amp * d;
      y += (random(`y${f}-${at}`) - 0.5) * 2 * amp * d;
      r += (random(`r${f}-${at}`) - 0.5) * amp * 0.05 * d;
    }
  }
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg)`;
};

// 1 at each beat (or subdivision), decaying until the next
export const pulse = (f: number, div = 1, decay = 6) => {
  const p = BF / div;
  return Math.exp(-((f % p) / p) * decay);
};

export const Txt: React.FC<{
  w?: number; g?: number; size: number; color?: string; style?: React.CSSProperties; children: React.ReactNode;
}> = ({ w = 100, g = 900, size, color = C.ice, style, children }) => (
  <div style={{
    fontFamily: DISPLAY, fontVariationSettings: vf(w, g), fontSize: size, lineHeight: 0.86,
    color, whiteSpace: "nowrap", letterSpacing: "-0.01em", ...style,
  }}>{children}</div>
);

export const Mono: React.FC<{ size?: number; color?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ size = 20, color = C.ice, style, children }) => (
  <div style={{ fontFamily: MONO, fontSize: size, color, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", ...style }}>{children}</div>
);
