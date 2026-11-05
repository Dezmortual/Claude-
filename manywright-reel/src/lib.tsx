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
  navy: "#0F1B2D",
  deep: "#08111D",
  amber: "#F5A524",
  coral: "#E8775E",
  ice: "#F4F6FA",
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

// ---- the Manywright M, traced from the brand logo (viewBox units of the 512px master).
// Four pieces: left upright, left diagonal, amber diagonal, right upright.
export const M_PIECES: { pts: string; amber: boolean; c: [number, number] }[] = [
  { pts: "122,168 170,249 170,363 122,363", amber: false, c: [146, 290] },
  { pts: "122,148 178,148 252,274 252,363 249,363", amber: false, c: [190, 245] },
  { pts: "389,148 333,148 259,276 259,363 262,363", amber: true, c: [321, 245] },
  { pts: "389,168 341,249 341,363 389,363", amber: false, c: [365, 290] },
];
export const M_VIEW = { x: 118, y: 144, w: 275, h: 223 }; // centre = 255.5, 255.5
export type PieceT = { dx?: number; dy?: number; rot?: number; s?: number; o?: number };
export const MLogo: React.FC<{ height: number; piece?: (i: number) => PieceT; mono?: string; style?: React.CSSProperties }> = ({ height, piece, mono, style }) => (
  <svg width={(height * M_VIEW.w) / M_VIEW.h} height={height} viewBox={`${M_VIEW.x} ${M_VIEW.y} ${M_VIEW.w} ${M_VIEW.h}`} style={{ overflow: "visible", ...style }}>
    {M_PIECES.map((p, i) => {
      const { dx = 0, dy = 0, rot = 0, s = 1, o = 1 } = piece ? piece(i) : {};
      const [cx, cy] = p.c;
      const fill = mono || (p.amber ? C.amber : C.ice);
      return (
        <g key={i} opacity={o} transform={`translate(${dx} ${dy}) rotate(${rot} ${cx} ${cy}) translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`}>
          <polygon points={p.pts} fill={fill} stroke={fill} strokeWidth={3} strokeLinejoin="round" />
        </g>
      );
    })}
  </svg>
);
