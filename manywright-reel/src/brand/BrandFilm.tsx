import React from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, random, staticFile, useCurrentFrame } from "remotion";
import rough from "roughjs";
import { M_PIECES } from "../lib";
import * as CUE from "./cues.mjs";

/* "A sketchbook comes to life" — manywright.com/services/brand/, hand-drawn.
   Every line is a rough.js stroke that "boils" (redrawn with a new seed 12 times a second), every word is from
   the page, and every stroke, pop, flip and stamp is timed from cues.mjs, which also drives the sound. */

export const BRAND_FPS = 60;
export const BRAND_FRAMES = CUE.DUR * 60;
const W = 1080, H = 1920;
const INK = "#23201C", PAPER = "#FBF6EA", AMBER = "#F5A524", CORAL = "#F0675A", SKY = "#7EC8E3", MINT = "#8FD6B4", NAVY = "#0F1B2D", PINK = "#F6A6B2", GREY = "#9AA3AE";
const HAND = "'Caveat', 'Comic Sans MS', cursive";

const fontHandle = delayRender("brand-font");
if (typeof document !== "undefined") {
  const s = document.createElement("style");
  s.textContent = `@font-face { font-family: 'Caveat'; src: url('${staticFile("Caveat-var.woff2")}') format('woff2'); font-weight: 400 700; font-display: block; }`;
  document.head.appendChild(s);
  document.fonts.load("700 80px Caveat").then(() => continueRender(fontHandle)).catch(() => continueRender(fontHandle));
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x: number) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const prog = (t: number, key: keyof typeof CUE.DRAW) => { const [s, d] = CUE.DRAW[key]; return clamp((t - s) / d); };
const popK = (t: number, at: number, d = 0.35) => outBack(clamp((t - at) / d));

/* ---------------- rough ink ---------------- */
const gen = rough.generator();
type Sh = { k: "rect" | "circle" | "ellipse" | "line" | "path" | "poly" | "arc" | "curve"; a: any; o?: any };
const shape = (sh: Sh, seed: number) => {
  const o = { roughness: 1.3, bowing: 1.2, stroke: INK, strokeWidth: 4.5, seed: seed || 1, fillWeight: 3, hachureGap: 9, ...sh.o };
  const a = sh.a;
  const d = sh.k === "rect" ? gen.rectangle(a[0], a[1], a[2], a[3], o) : sh.k === "circle" ? gen.circle(a[0], a[1], a[2], o) : sh.k === "ellipse" ? gen.ellipse(a[0], a[1], a[2], a[3], o)
    : sh.k === "line" ? gen.line(a[0], a[1], a[2], a[3], o) : sh.k === "poly" ? gen.polygon(a, o) : sh.k === "curve" ? gen.curve(a, o) : sh.k === "arc" ? gen.arc(a[0], a[1], a[2], a[3], a[4], a[5], false, o) : gen.path(a, o);
  return gen.toPaths(d);
};
// draws a list of shapes in order as p goes 0 → 1; the ink boils every 5 frames
const Ink: React.FC<{ sh: Sh[]; p?: number; f: number; seed?: number; tf?: string; opacity?: number }> = ({ sh, p = 1, f, seed = 1, tf, opacity = 1 }) => {
  if (p <= 0) return null;
  const boil = Math.floor(f / 5);
  return (
    <g transform={tf} opacity={opacity}>
      {sh.map((s, i) => {
        const q = clamp(p * sh.length - i);
        if (q <= 0) return null;
        return shape(s, seed * 97 + i * 13 + (boil % 3) * 7919).map((pi: any, j: number) => (
          <path key={`${i}-${j}`} d={pi.d} stroke={pi.stroke === "none" ? undefined : pi.stroke} strokeWidth={pi.strokeWidth} fill={pi.fill || "none"}
            fillOpacity={pi.fill && pi.fill !== "none" ? q : undefined} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - q} />
        ));
      })}
    </g>
  );
};

/* ---------------- hand lettering ---------------- */
// writes itself on, line by line; jitters with the boil so it feels hand-made
const Hand: React.FC<{ lines: string[]; x: number; y: number; size: number; color?: string; f: number; t: number; start?: number; dur?: number; popAt?: number; align?: "center" | "left"; weight?: number; rot?: number; lh?: number; seed?: number }> = (
  { lines, x, y, size, color = INK, f, t, start, dur, popAt, align = "center", weight = 700, rot = 0, lh = 1.0, seed = 1 }) => {
  let P = 1, scale = 1;
  if (start !== undefined) P = clamp((t - start) / (dur || 0.5));
  if (popAt !== undefined) { if (t < popAt) return null; scale = popK(t, popAt); }
  if (P <= 0) return null;
  const boil = Math.floor(f / 5), jx = (random(`hx${seed}${boil}`) - 0.5) * 2.4, jy = (random(`hy${seed}${boil}`) - 0.5) * 2.4, jr = (random(`hr${seed}${boil}`) - 0.5) * 0.8;
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(${align === "center" ? "-50%" : "0"}, 0) translate(${jx}px, ${jy}px) rotate(${rot + jr}deg) scale(${scale})`, transformOrigin: "50% 50%", textAlign: align }}>
      {lines.map((l, i) => {
        const q = clamp(P * lines.length - i);
        return <div key={i} style={{ fontFamily: HAND, fontWeight: weight, fontSize: size, lineHeight: lh, color, whiteSpace: "nowrap", padding: "0 0.18em", clipPath: q >= 1 ? undefined : `inset(-30% ${(1 - q) * 100}% -30% -10%)` }}>{l}</div>;
      })}
    </div>
  );
};
// a little paper tag or sticker that pops in
const Tag: React.FC<{ text: string; x: number; y: number; at: number; t: number; f: number; color?: string; size?: number; rot?: number; seed?: number }> = ({ text, x, y, at, t, f, color = AMBER, size = 44, rot = 0, seed = 3 }) => {
  if (t < at) return null;
  const k = popK(t, at), w = text.length * size * 0.5 + 60, h = size * 1.6;
  return (
    <div style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, transform: `rotate(${rot}deg) scale(${k})` }}>
      <svg width={w + 20} height={h + 20} style={{ position: "absolute", left: -10, top: -10 }}>
        <Ink f={f} seed={seed} sh={[{ k: "rect", a: [12, 12, w - 4, h - 4], o: { fill: color, fillStyle: "solid", strokeWidth: 3.5 } }]} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: HAND, fontWeight: 700, fontSize: size, color: INK }}>{text}</div>
    </div>
  );
};

/* ---------------- the cast ---------------- */
// the pencil: tip at (0,0), pointing down; drawn upright and tilted by the caller
const pencilShapes = (mood: "happy" | "sad" | "wink"): Sh[] => [
  { k: "poly", a: [[-28, -330], [28, -330], [28, -70], [-28, -70]], o: { fill: AMBER, fillStyle: "hachure", hachureAngle: 60, hachureGap: 7 } },
  { k: "poly", a: [[0, 0], [-28, -70], [28, -70]], o: { fill: "#E9C9A0", fillStyle: "solid" } },
  { k: "poly", a: [[0, 0], [-9, -22], [9, -22]], o: { fill: INK, fillStyle: "solid" } },
  { k: "rect", a: [-30, -362, 60, 32], o: { fill: GREY, fillStyle: "cross-hatch", hachureGap: 6 } },
  { k: "path", a: "M -28 -362 L -28 -392 Q -28 -404 -16 -404 L 16 -404 Q 28 -404 28 -392 L 28 -362 Z", o: { fill: PINK, fillStyle: "solid" } },
  { k: "circle", a: [-11, -232, 26], o: { fill: "#fff", fillStyle: "solid", strokeWidth: 3 } },
  { k: "circle", a: [13, -232, 26], o: { fill: "#fff", fillStyle: "solid", strokeWidth: 3 } },
  mood === "wink" ? { k: "line", a: [6, -232, 22, -230], o: { strokeWidth: 4 } } : { k: "circle", a: [15, mood === "sad" ? -226 : -234, 9], o: { fill: INK, fillStyle: "solid" } },
  { k: "circle", a: [-9, mood === "sad" ? -226 : -234, 9], o: { fill: INK, fillStyle: "solid" } },
  { k: "path", a: mood === "sad" ? "M -12 -186 Q 2 -200 16 -186" : "M -14 -200 Q 2 -182 18 -200", o: { strokeWidth: 4 } },
];
const Pencil: React.FC<{ x: number; y: number; rot: number; f: number; mood?: "happy" | "sad" | "wink"; s?: number; squash?: number }> = ({ x, y, rot, f, mood = "happy", s = 1, squash = 0 }) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
    <Ink f={f} seed={41} sh={pencilShapes(mood)} tf={`translate(${x} ${y}) rotate(${rot}) scale(${s * (1 + squash * 0.15)} ${s * (1 - squash * 0.2)})`} />
  </svg>
);
const Eraser: React.FC<{ x: number; y: number; rot: number; f: number }> = ({ x, y, rot, f }) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
    <Ink f={f} seed={77} tf={`translate(${x} ${y}) rotate(${rot})`} sh={[
      { k: "path", a: "M -90 -45 L 90 -45 Q 102 -45 102 -33 L 102 33 Q 102 45 90 45 L -90 45 Q -102 45 -102 33 L -102 -33 Q -102 -45 -90 -45 Z", o: { fill: PINK, fillStyle: "solid" } },
      { k: "rect", a: [-30, -45, 60, 90], o: { fill: SKY, fillStyle: "hachure", hachureGap: 7 } },
      { k: "circle", a: [-58, -8, 24], o: { fill: "#fff", fillStyle: "solid", strokeWidth: 3 } }, { k: "circle", a: [-56, -6, 9], o: { fill: INK, fillStyle: "solid" } },
      { k: "circle", a: [58, -8, 24], o: { fill: "#fff", fillStyle: "solid", strokeWidth: 3 } }, { k: "circle", a: [60, -6, 9], o: { fill: INK, fillStyle: "solid" } },
      { k: "path", a: "M -14 18 Q 0 30 14 18", o: { strokeWidth: 4 } },
    ]} />
  </svg>
);

/* ---------------- doodles ---------------- */
const logoB = (cx: number, cy: number, s: number, extra = 0): Sh[] => [ // the chosen concept: a leaf in a circle
  { k: "circle", a: [cx, cy, 200 * s], o: { fill: MINT, fillStyle: "hachure", hachureGap: 10 * s } },
  { k: "path", a: `M ${cx} ${cy + 70 * s} C ${cx - 70 * s} ${cy + 10 * s}, ${cx - 50 * s} ${cy - 60 * s}, ${cx} ${cy - 80 * s} C ${cx + 50 * s} ${cy - 60 * s}, ${cx + 70 * s} ${cy + 10 * s}, ${cx} ${cy + 70 * s} Z`, o: { fill: NAVY, fillStyle: "solid", strokeWidth: 4 } },
  ...(extra >= 1 ? [{ k: "line", a: [cx, cy + 66 * s, cx, cy - 60 * s], o: { stroke: AMBER, strokeWidth: 5 } } as Sh] : []),
  ...(extra >= 2 ? [{ k: "line", a: [cx, cy + 10 * s, cx + 28 * s, cy - 18 * s], o: { stroke: AMBER, strokeWidth: 5 } } as Sh, { k: "line", a: [cx, cy + 30 * s, cx - 26 * s, cy + 4 * s], o: { stroke: AMBER, strokeWidth: 5 } } as Sh] : []),
];
const logoA = (cx: number, cy: number, s: number): Sh[] => [
  { k: "circle", a: [cx, cy, 120 * s], o: { fill: AMBER, fillStyle: "zigzag", hachureGap: 9 * s } },
  ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return { k: "line", a: [cx + Math.cos(a) * 75 * s, cy + Math.sin(a) * 75 * s, cx + Math.cos(a) * 100 * s, cy + Math.sin(a) * 100 * s] } as Sh; }),
];
const logoC = (cx: number, cy: number, s: number): Sh[] => [
  { k: "poly", a: [[cx - 85 * s, cy + 60 * s], [cx - 20 * s, cy - 50 * s], [cx + 20 * s, cy + 10 * s], [cx + 45 * s, cy - 25 * s], [cx + 85 * s, cy + 60 * s]], o: { fill: CORAL, fillStyle: "cross-hatch", hachureGap: 10 * s } },
  { k: "circle", a: [cx + 50 * s, cy - 65 * s, 34 * s], o: { fill: AMBER, fillStyle: "solid" } },
];
const sign = (cx: number, cy: number): Sh[] => [{ k: "line", a: [cx, cy + 20, cx, cy + 150] }, { k: "rect", a: [cx - 110, cy - 70, 220, 100], o: { fill: AMBER, fillStyle: "hachure" } }, { k: "line", a: [cx - 60, cy + 150, cx + 60, cy + 150] }];
const van = (cx: number, cy: number): Sh[] => [
  { k: "rect", a: [cx - 130, cy - 70, 170, 120], o: { fill: SKY, fillStyle: "hachure" } },
  { k: "path", a: `M ${cx + 40} ${cy - 40} L ${cx + 100} ${cy - 40} L ${cx + 130} ${cy + 5} L ${cx + 130} ${cy + 50} L ${cx + 40} ${cy + 50} Z`, o: { fill: "#fff", fillStyle: "solid" } },
  { k: "circle", a: [cx - 80, cy + 58, 50], o: { fill: INK, fillStyle: "solid" } }, { k: "circle", a: [cx + 80, cy + 58, 50], o: { fill: INK, fillStyle: "solid" } },
];
const browser = (cx: number, cy: number): Sh[] => [
  { k: "rect", a: [cx - 115, cy - 80, 230, 170], o: { fill: "#fff", fillStyle: "solid" } }, { k: "line", a: [cx - 115, cy - 48, cx + 115, cy - 48] },
  { k: "circle", a: [cx - 95, cy - 64, 12], o: { fill: CORAL, fillStyle: "solid", strokeWidth: 2 } }, { k: "rect", a: [cx - 90, cy - 25, 100, 60], o: { fill: MINT, fillStyle: "hachure" } }, { k: "line", a: [cx + 25, cy - 15, cx + 95, cy - 15] }, { k: "line", a: [cx + 25, cy + 10, cx + 80, cy + 10] },
];
const phone = (cx: number, cy: number): Sh[] => [{ k: "rect", a: [cx - 75, cy - 130, 150, 260], o: { fill: "#fff", fillStyle: "solid" } }, { k: "line", a: [cx - 20, cy - 115, cx + 20, cy - 115] }];
const shirt = (cx: number, cy: number): Sh[] => [{ k: "path", a: `M ${cx - 60} ${cy - 120} L ${cx - 140} ${cy - 80} L ${cx - 110} ${cy - 20} L ${cx - 80} ${cy - 35} L ${cx - 80} ${cy + 130} L ${cx + 80} ${cy + 130} L ${cx + 80} ${cy - 35} L ${cx + 110} ${cy - 20} L ${cx + 140} ${cy - 80} L ${cx + 60} ${cy - 120} Q ${cx} ${cy - 85} ${cx - 60} ${cy - 120} Z`, o: { fill: "#fff", fillStyle: "solid" } }];
const star = (cx: number, cy: number, r: number): Sh => ({ k: "poly", a: Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; }), o: { fill: AMBER, fillStyle: "solid", strokeWidth: 3 } });
const S = ({ children }: { children: React.ReactNode }) => <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>{children}</svg>;

/* ---------------- scenes (each a pure function of time) ---------------- */
type Sc = React.FC<{ t: number; f: number }>;
const Hook: Sc = ({ t, f }) => (
  <>
    <S><Ink f={f} seed={5} p={prog(t, "hookFrame")} sh={[{ k: "ellipse", a: [540, 640, 960, 560], o: { stroke: CORAL, strokeWidth: 6 } }]} /></S>
    <Hand f={f} t={t} lines={["A logo and a look", "you can use"]} x={540} y={430} size={118} start={CUE.DRAW.headline[0]} dur={CUE.DRAW.headline[1] * 0.7} seed={1} />
    <Hand f={f} t={t} lines={["everywhere"]} x={540} y={666} size={150} color={CORAL} start={CUE.DRAW.headline[0] + CUE.DRAW.headline[1] * 0.7} dur={CUE.DRAW.headline[1] * 0.3} seed={2} rot={-3} />
    <S><Ink f={f} seed={6} p={clamp((t - 2.5) / 0.3)} sh={[{ k: "curve", a: [[300, 830], [540, 815], [780, 832]], o: { stroke: AMBER, strokeWidth: 9 } }]} /></S>
    <Tag text="SERVICE — LOGO AND BRAND BASICS" x={540} y={290} at={2.8} t={t} f={f} color={SKY} size={38} rot={-2} />
    {["MARK", "COLOR", "TYPE", "KIT"].map((w, i) => <Tag key={w} text={w} x={200 + i * 225} y={1040} at={[3.05, 3.2, 3.35, 3.5][i]} t={t} f={f} color={[AMBER, CORAL, MINT, SKY][i]} size={50} rot={i % 2 ? 4 : -4} seed={10 + i} />)}
  </>
);
const WhoFor: Sc = ({ t, f }) => {
  const sad = t > 7.0 ? 1 : 0;
  return (
    <>
      <Hand f={f} t={t} lines={["For new businesses,", "or ones with a", "homemade logo"]} x={540} y={300} size={96} start={CUE.DRAW.whoforHead[0]} dur={CUE.DRAW.whoforHead[1]} seed={3} />
      <S>
        <Ink f={f} seed={21} p={prog(t, "sign")} sh={sign(230, 790)} />
        <Ink f={f} seed={22} p={prog(t, "van")} sh={van(540, 820)} />
        <Ink f={f} seed={23} p={prog(t, "website")} sh={browser(830, 810)} />
        <Ink f={f} seed={24} p={prog(t, "phone")} sh={phone(300, 1230)} />
        <Ink f={f} seed={25} p={prog(t, "shirt")} sh={shirt(770, 1240)} />
      </S>
      {/* the homemade logo: blurry on the phone, misprinted on the shirt */}
      {t > 6.75 && <div style={{ position: "absolute", left: 300 - 55, top: 1230 - 55, width: 110, height: 110, borderRadius: 55, background: `radial-gradient(circle, ${CORAL} 30%, ${AMBER} 65%, transparent 70%)`, filter: "blur(9px)", opacity: popK(t, 6.75) }} />}
      {t > 7.2 && <><div style={{ position: "absolute", left: 770 - 50, top: 1220 - 50, width: 100, height: 100, borderRadius: 50, background: CORAL, opacity: 0.7 * popK(t, 7.2) }} /><div style={{ position: "absolute", left: 770 - 38, top: 1220 - 58, width: 100, height: 100, borderRadius: 50, border: `6px solid ${AMBER}`, opacity: 0.8 * popK(t, 7.2) }} /></>}
      <Hand f={f} t={t} lines={["the sign"]} x={230} y={1010} size={56} popAt={5.45} seed={4} color={CORAL} rot={-4} />
      <Hand f={f} t={t} lines={["the van"]} x={540} y={1010} size={56} popAt={5.95} seed={5} color={CORAL} rot={3} />
      <Hand f={f} t={t} lines={["the website"]} x={830} y={1010} size={56} popAt={6.45} seed={6} color={CORAL} rot={-3} />
      <Hand f={f} t={t} lines={["looks blurry", "on Instagram"]} x={300} y={1385} size={54} popAt={6.9} seed={7} />
      <Hand f={f} t={t} lines={["doesn't print cleanly", "on a shirt"]} x={720} y={1395} size={50} popAt={7.2} seed={8} />
      {sad > 0 && <Hand f={f} t={t} lines={["oh no…"]} x={505} y={1180} size={46} popAt={7.05} seed={9} color={GREY} rot={-8} />}
    </>
  );
};
const Concepts: Sc = ({ t, f }) => {
  const choose = t >= 12.0;
  const ring = prog(t, "chooseRing");
  const crumpleA = clamp((t - 13.4) / 0.3), crumpleC = clamp((t - 13.6) / 0.3), fly = clamp((t - 13.75) / 0.45);
  const center = io(clamp((t - 13.95) / 0.5));
  const bx = 520, by = 1060 - (1060 - 980) * center, bs = 1 + 0.6 * center;
  return (
    <>
      <S>
        <Ink f={f} seed={31} p={prog(t, "clipboard")} sh={[
          { k: "rect", a: [150, 300, 280, 340], o: { fill: "#E9C9A0", fillStyle: "hachure", hachureGap: 12 } },
          { k: "rect", a: [230, 280, 120, 40], o: { fill: GREY, fillStyle: "solid" } },
          ...[0, 1, 2].flatMap((i) => [{ k: "rect", a: [185, 360 + i * 85, 40, 40], o: { fill: "#fff", fillStyle: "solid" } } as Sh, { k: "line", a: [245, 380 + i * 85, 390, 380 + i * 85] } as Sh]),
        ]} />
        {[8.7, 8.9, 9.1].map((at, i) => <Ink key={i} f={f} seed={35 + i} p={clamp((t - at) / 0.15)} sh={[{ k: "path", a: `M 190 ${380 + i * 85} L 203 ${395 + i * 85} L 232 ${355 + i * 85}`, o: { stroke: CORAL, strokeWidth: 7 } }]} />)}
      </S>
      <Hand f={f} t={t} lines={["a short", "questionnaire"]} x={680} y={380} size={70} popAt={8.7} seed={11} rot={-4} />
      <Hand f={f} t={t} lines={["Three concepts"]} x={540} y={700} size={118} start={CUE.DRAW.conceptsHead[0]} dur={CUE.DRAW.conceptsHead[1]} seed={12} />
      <S>
        {/* concept A, crumpled then thrown left */}
        {fly < 1 && <Ink f={f} seed={51} p={prog(t, "conceptA")} sh={crumpleA > 0 ? [{ k: "circle", a: [210, 1060, 150 * (1 - 0.4 * crumpleA)], o: { fill: "#fff", fillStyle: "solid" } }, { k: "path", a: "M 160 1040 L 240 1080 L 180 1100 L 250 1020 L 200 1010", o: { strokeWidth: 3 } }] : [{ k: "rect", a: [100, 950, 220, 220], o: { fill: "#fff", fillStyle: "solid" } }, ...logoA(210, 1060, 0.9)]} tf={`translate(${-700 * io(fly)} ${-300 * Math.sin(Math.PI * fly)}) rotate(${-200 * fly} 210 1060)`} />}
        <Ink f={f} seed={52} p={prog(t, "conceptB")} sh={[...(center < 0.5 ? [{ k: "rect", a: [410, 950, 220, 220], o: { fill: "#fff", fillStyle: "solid" } } as Sh] : []), ...logoB(bx, by, 0.9 * bs)]} />
        {fly < 1 && <Ink f={f} seed={53} p={prog(t, "conceptC")} sh={crumpleC > 0 ? [{ k: "circle", a: [830, 1060, 150 * (1 - 0.4 * crumpleC)], o: { fill: "#fff", fillStyle: "solid" } }, { k: "path", a: "M 780 1040 L 860 1080 L 800 1100 L 870 1020 L 820 1010", o: { strokeWidth: 3 } }] : [{ k: "rect", a: [720, 950, 220, 220], o: { fill: "#fff", fillStyle: "solid" } }, ...logoC(830, 1060, 0.9)]} tf={`translate(${700 * io(fly)} ${-300 * Math.sin(Math.PI * fly)}) rotate(${200 * fly} 830 1060)`} />}
        {choose && center < 0.2 && <Ink f={f} seed={54} p={ring} sh={[{ k: "ellipse", a: [520, 1060, 300, 300], o: { stroke: CORAL, strokeWidth: 8 } }]} />}
      </S>
      {!choose && <Hand f={f} t={t} lines={["Three distinct directions"]} x={540} y={1260} size={64} popAt={11.5} seed={13} color={CORAL} />}
      <Hand f={f} t={t} lines={["You choose one"]} x={540} y={1300} size={92} start={CUE.DRAW.chooseText[0]} dur={CUE.DRAW.chooseText[1]} seed={14} color={CORAL} />
    </>
  );
};
const Revise: Sc = ({ t, f }) => {
  const extra = t >= 17.35 ? 2 : t >= 16.4 ? 1 : 0;
  const redraw = extra === 2 ? prog(t, "redraw2") : extra === 1 ? prog(t, "redraw1") : 1;
  return (
    <>
      <Hand f={f} t={t} lines={["2 revision rounds"]} x={540} y={300} size={110} start={CUE.DRAW.reviseHead[0]} dur={CUE.DRAW.reviseHead[1]} seed={15} />
      <S>
        <Ink f={f} seed={61} sh={logoB(540, 900, 1.6, 0)} />
        {extra >= 1 && <Ink f={f} seed={62} p={extra === 1 ? redraw : 1} sh={logoB(540, 900, 1.6, 1).slice(2, 3)} />}
        {extra >= 2 && <Ink f={f} seed={63} p={redraw} sh={logoB(540, 900, 1.6, 2).slice(3)} />}
        {/* eraser crumbs */}
        {[[16.0, 0.4], [17.0, 0.35]].map(([s, d], k) => t > s && t < s + d + 0.4 ? Array.from({ length: 8 }, (_, i) => { const q = clamp((t - s - i * 0.04) / 0.5); return <circle key={`${k}${i}`} cx={540 + (i - 4) * 22 + q * (i - 4) * 10} cy={980 + q * 260} r={5} fill={PINK} opacity={1 - q} />; }) : null)}
      </S>
      <Tag text="round 1" x={220} y={620} at={15.8} t={t} f={f} color={AMBER} size={52} rot={-8} seed={70} />
      <Tag text="round 2" x={860} y={620} at={16.9} t={t} f={f} color={MINT} size={52} rot={7} seed={71} />
      <Hand f={f} t={t} lines={["One consolidated", "list of changes"]} x={540} y={1250} size={66} popAt={16.05} seed={16} color={CORAL} />
      {t > 17.65 && <S><Ink f={f} seed={64} p={clamp((t - 17.65) / 0.2)} sh={[{ k: "path", a: "M 760 1100 L 800 1150 L 900 1030", o: { stroke: "#2E9E5B", strokeWidth: 12 } }]} /></S>}
    </>
  );
};
const Formats: Sc = ({ t, f }) => {
  const stamped = (at: number) => t >= at;
  const st = (at: number) => ({ k: 1.8 - 0.8 * outBack(clamp((t - at) / 0.25)), o: clamp((t - at) / 0.06) });
  const mono = t >= 20.35;
  return (
    <>
      <Hand f={f} t={t} lines={["Every file format"]} x={540} y={300} size={112} start={CUE.DRAW.formatsHead[0]} dur={CUE.DRAW.formatsHead[1]} seed={17} />
      <S>
        <Ink f={f} seed={81} p={clamp((t - 18.0) / 0.5)} sh={sign(230, 720)} />
        <Ink f={f} seed={82} p={clamp((t - 18.15) / 0.5)} sh={shirt(540, 760)} />
        <Ink f={f} seed={83} p={clamp((t - 18.3) / 0.5)} sh={phone(850, 740)} />
        {[[18.9, 230, 670, 0.42], [19.3, 540, 740, 0.5], [19.7, 850, 730, 0.4]].map(([at, x, y, s], i) => stamped(at) && (
          <g key={i} opacity={st(at).o} transform={`translate(${x} ${y}) scale(${st(at).k}) translate(${-x} ${-y})`}>
            <Ink f={f} seed={84 + i} sh={logoB(x, y, s, 2)} />
          </g>
        ))}
        {mono && <Ink f={f} seed={90} sh={logoB(820, 1440, 0.55, 2).map((s) => ({ ...s, o: { ...(s.o || {}), fill: s.o?.fill ? INK : undefined, stroke: INK } }))} opacity={popK(t, 20.35)} />}
        {mono && <Ink f={f} seed={91} sh={logoB(620, 1440, 0.55, 2)} opacity={popK(t, 20.35)} />}
      </S>
      <Hand f={f} t={t} lines={["a sign, a shirt and a phone screen"]} x={540} y={940} size={58} popAt={19.85} seed={18} color={CORAL} />
      {["COLOR", "ONE-COLOR", "SVG", "PNG", "PDF"].map((w, i) => <Tag key={w} text={w} x={[200, 470, 760, 260, 440][i]} y={[1130, 1130, 1130, 1290, 1290][i]} at={[20.1, 20.35, 20.6, 20.85, 21.1][i]} t={t} f={f} color={[AMBER, "#ddd", SKY, MINT, CORAL][i]} size={54} rot={[-5, 3, -3, 4, -4][i]} seed={100 + i} />)}
    </>
  );
};
const Palette: Sc = ({ t, f }) => (
  <>
    <Hand f={f} t={t} lines={["Palette and fonts"]} x={540} y={300} size={112} start={CUE.DRAW.paletteHead[0]} dur={CUE.DRAW.paletteHead[1]} seed={19} />
    <S>
      {[AMBER, CORAL, MINT, NAVY].map((c, i) => <Ink key={i} f={f} seed={110 + i} p={prog(t, `sw${i}` as any)} sh={[{ k: "circle", a: [180 + i * 240, 680, 190], o: { fill: c, fillStyle: i % 2 ? "zigzag" : "hachure", hachureGap: 7, fillWeight: 5, stroke: INK } }]} />)}
      <Ink f={f} seed={115} p={prog(t, "aa")} sh={[{ k: "rect", a: [120, 860, 840, 360], o: { stroke: INK, strokeWidth: 4 } }, { k: "line", a: [540, 880, 540, 1200], o: { strokeWidth: 3 } }]} />
    </S>
    <div style={{ position: "absolute", left: 330, top: 1040, transform: "translate(-50%, -50%)", fontFamily: "'Archivo', sans-serif", fontVariationSettings: "'wdth' 110, 'wght' 850", fontSize: 230, color: NAVY, padding: "0 0.1em", clipPath: clamp(prog(t, "aa") * 2) >= 1 ? undefined : `inset(-20% ${(1 - clamp(prog(t, "aa") * 2)) * 100}% -20% 0)` }}>Aa</div>
    <div style={{ position: "absolute", left: 750, top: 1040, transform: "translate(-50%, -50%) rotate(-4deg)", fontFamily: HAND, fontWeight: 700, fontSize: 250, color: CORAL, padding: "0 0.15em", clipPath: clamp(prog(t, "aa") * 2 - 1) >= 1 ? undefined : `inset(-20% ${(1 - clamp(prog(t, "aa") * 2 - 1)) * 100}% -20% 0)` }}>Aa</div>
    <Hand f={f} t={t} lines={["Colors and a font pairing", "on one page"]} x={540} y={1290} size={66} popAt={24.9} seed={20} />
  </>
);
const Kit: Sc = ({ t, f }) => {
  const page = PAGE_FLIP(t);
  return (
    <>
      <Hand f={f} t={t} lines={["Brand Kit"]} x={540} y={290} size={130} start={CUE.DRAW.kitHead[0]} dur={CUE.DRAW.kitHead[1]} seed={21} color={CORAL} />
      <S>
        <Ink f={f} seed={120} p={clamp((t - 26.3) / 0.35)} sh={[{ k: "rect", a: [330, 500, 420, 300], o: { fill: "#fff", fillStyle: "solid" } }, { k: "line", a: [540, 505, 540, 795], o: { strokeWidth: 3 } }]} />
        {page.map((q, i) => <Ink key={i} f={f} seed={130 + i} sh={[{ k: "rect", a: [540, 508, 200 * Math.cos(q * Math.PI), 284], o: { fill: i % 2 ? SKY : "#fff", fillStyle: "hachure", hachureGap: 14, strokeWidth: 3 } }]} />)}
        <Ink f={f} seed={140} p={clamp((t - 26.5) / 0.3)} sh={logoB(440, 650, 0.45, 2)} />
        <Ink f={f} seed={141} p={prog(t, "card")} sh={[{ k: "rect", a: [110, 1060, 240, 140], o: { fill: AMBER, fillStyle: "hachure" } }, { k: "line", a: [140, 1160, 280, 1160] }]} />
        <Ink f={f} seed={142} p={prog(t, "social")} sh={[{ k: "rect", a: [520, 1050, 400, 150], o: { fill: SKY, fillStyle: "hachure" } }, { k: "circle", a: [600, 1180, 90], o: { fill: MINT, fillStyle: "solid" } }]} />
        <Ink f={f} seed={143} p={prog(t, "signature")} sh={[{ k: "path", a: "M 120 1420 C 160 1360, 190 1460, 230 1400 S 300 1380, 340 1420", o: { stroke: NAVY, strokeWidth: 6 } }, { k: "line", a: [110, 1440, 350, 1440] }]} />
        <Ink f={f} seed={144} p={prog(t, "invoice")} sh={[{ k: "rect", a: [610, 1340, 220, 150], o: { fill: "#fff", fillStyle: "solid" } }, ...[0, 1, 2].map((i) => ({ k: "line", a: [635, 1375 + i * 35, 805, 1375 + i * 35] } as Sh))]} />
      </S>
      <Hand f={f} t={t} lines={["8 to 10 page brand guide"]} x={540} y={850} size={64} popAt={27.6} seed={22} color={CORAL} />
      <Hand f={f} t={t} lines={["business card"]} x={230} y={1215} size={48} popAt={28.25} seed={23} />
      <Hand f={f} t={t} lines={["social profile", "and cover images"]} x={720} y={1210} size={46} popAt={28.55} seed={24} />
      <Hand f={f} t={t} lines={["email signature"]} x={230} y={1455} size={48} popAt={28.85} seed={25} />
      <Hand f={f} t={t} lines={["invoice template"]} x={720} y={1500} size={46} popAt={29.15} seed={26} />
    </>
  );
};
const PAGE_FLIP = (t: number) => CUE.PAGE_TICKS.map((at) => clamp((t - at) / 0.2)).filter((q) => q > 0 && q < 1);
const PriceTag: React.FC<{ x: number; y: number; rot: number; p: number; t: number; f: number; name: string; price: string; days: string; color: string; seed: number; coinAt: number }> = ({ x, y, rot, p, t, f, name, price, days, color, seed, coinAt }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) rotate(${rot + Math.sin(t * 2.4 + seed) * 2}deg)` }}>
    <svg width={460} height={340} style={{ position: "absolute", left: -230, top: -170, overflow: "visible" }}>
      <Ink f={f} seed={seed} p={p} sh={[
        { k: "path", a: "M 60 20 L 430 20 L 430 320 L 60 320 L 10 170 Z", o: { fill: color, fillStyle: "hachure", hachureGap: 11, fillWeight: 3 } },
        { k: "circle", a: [62, 170, 30], o: { fill: PAPER, fillStyle: "solid" } },
        { k: "curve", a: [[62, 170], [20, 80], [-30, 40]], o: { strokeWidth: 3 } },
      ]} />
    </svg>
    <div style={{ position: "absolute", left: -160, top: -150, width: 380, opacity: clamp(p * 2 - 1), fontFamily: HAND, color: INK, textAlign: "center" }}>
      <div style={{ fontSize: 58, fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: 120, fontWeight: 700, lineHeight: 0.95, transform: `scale(${t > coinAt ? 1 + 0.15 * Math.max(0, 1 - (t - coinAt) / 0.3) : 1})` }}>{price}</div>
      <div style={{ fontSize: 46, fontWeight: 600, lineHeight: 1 }}>fixed</div>
      <div style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.1 }}>{days}</div>
    </div>
    {t > coinAt && t < coinAt + 1 && <svg width={200} height={200} style={{ position: "absolute", left: 120, top: -200, overflow: "visible" }}><Ink f={f} seed={seed + 5} sh={[{ k: "circle", a: [60, 140 - 260 * Math.sin(Math.PI * clamp((t - coinAt) / 0.9)), 70], o: { fill: AMBER, fillStyle: "solid" } }]} /></svg>}
  </div>
);
const Prices: Sc = ({ t, f }) => (
  <>
    <PriceTag x={420} y={620} rot={-6} p={prog(t, "tagStarter")} t={t} f={f} name="Logo Starter" price="$1,250" days="10 business days" color={AMBER} seed={150} coinAt={30.7} />
    <PriceTag x={640} y={1060} rot={5} p={prog(t, "tagKit")} t={t} f={f} name="Brand Kit" price="$3,500" days="15 business days" color={MINT} seed={160} coinAt={31.6} />
    <Hand f={f} t={t} lines={["files supplied ready", "for your printer"]} x={540} y={1340} size={54} popAt={32.0} seed={27} color={GREY} />
  </>
);
const Own: Sc = ({ t, f }) => {
  const yes = prog(t, "ownYes");
  return (
    <>
      <Hand f={f} t={t} lines={["Do I own the logo?"]} x={540} y={420} size={112} start={CUE.DRAW.ownQ[0]} dur={CUE.DRAW.ownQ[1]} seed={28} />
      <div style={{ position: "absolute", left: 540, top: 820, transform: `translate(-50%, -50%) rotate(-6deg) scale(${0.6 + 0.4 * outBack(yes)})`, fontFamily: HAND, fontWeight: 700, fontSize: 340, color: AMBER, WebkitTextStroke: `6px ${INK}`, padding: "0 0.15em", clipPath: yes >= 1 ? undefined : `inset(-20% ${(1 - yes) * 100}% -20% 0)` }}>Yes.</div>
      <S>{t > 34.1 && Array.from({ length: 46 }, (_, i) => { const q = clamp((t - 34.1) / 1.4), a = random(`ca${i}`) * Math.PI * 2, sp = 300 + random(`cs${i}`) * 520; const x = 540 + Math.cos(a) * sp * q, y = 820 + Math.sin(a) * sp * q * 0.8 + 700 * q * q; return <Ink key={i} f={f} seed={200 + i} sh={[{ k: "rect", a: [x, y, 22, 12], o: { fill: [AMBER, CORAL, MINT, SKY][i % 4], fillStyle: "solid", strokeWidth: 2 } }]} tf={`rotate(${q * 720 * (i % 2 ? 1 : -1)} ${x + 11} ${y + 6})`} opacity={1 - q * 0.8} />; })}</S>
      <Hand f={f} t={t} lines={["Full rights to the final logo", "and files transfer to you", "on final payment."]} x={540} y={1160} size={58} popAt={34.8} seed={29} />
    </>
  );
};
const End: Sc = ({ t, f }) => {
  const sketch = prog(t, "logoSketch"), ink = prog(t, "logoInk");
  const sc = 1.25, ox = 540 - 255.5 * sc, oy = 640 - 255.5 * sc;
  return (
    <>
      <S>
        {M_PIECES.map((p, i) => {
          const pts = p.pts.split(" ").map((xy) => xy.split(",").map(Number)).map(([x, y]) => [ox + x * sc, oy + y * sc]);
          return <Ink key={i} f={f} seed={300 + i} p={clamp(sketch * 4 - i)} sh={[{ k: "poly", a: pts, o: { strokeWidth: 5, fill: ink > 0 ? (p.amber ? AMBER : NAVY) : undefined, fillStyle: "hachure", hachureGap: 7 * (1.6 - ink), fillWeight: 3 + 4 * ink } }]} />;
        })}
      </S>
      <Hand f={f} t={t} lines={["Ready for a logo", "you're proud of?"]} x={540} y={1010} size={104} start={CUE.DRAW.endLine[0]} dur={CUE.DRAW.endLine[1]} seed={30} />
      <Hand f={f} t={t} lines={["manywright.com"]} x={540} y={1290} size={96} popAt={38.3} seed={31} color={CORAL} />
      {t > 38.4 && <S><Ink f={f} seed={320} p={clamp((t - 38.4) / 0.3)} sh={[{ k: "curve", a: [[330, 1400], [540, 1385], [750, 1402]], o: { stroke: AMBER, strokeWidth: 9 } }]} /></S>}
    </>
  );
};

const SCENE_LIST: [keyof typeof CUE.SCENES, Sc][] = [["hook", Hook], ["whofor", WhoFor], ["concepts", Concepts], ["revise", Revise], ["formats", Formats], ["palette", Palette], ["kit", Kit], ["prices", Prices], ["own", Own], ["end", End]];
// transitions: [start, duration, kind]; the outgoing page leaves on top of the incoming one
const TRANS: [number, number, "flip" | "erase" | "slide"][] = [[3.7, 0.45, "flip"], [7.6, 0.4, "erase"], [14.6, 0.45, "flip"], [17.9, 0.4, "slide"], [21.6, 0.45, "flip"], [25.6, 0.4, "erase"], [29.6, 0.45, "flip"], [32.6, 0.4, "slide"], [35.6, 0.45, "flip"]];

/* ---------------- paper ---------------- */
// every scene is laid out in a 1080-wide sketch space; this maps it down and slightly up in size to fill the frame
const ZY = 130, ZS = 1.06;
const toFrame = (x: number, y: number): [number, number] => [540 + (x - 540) * ZS, ZY + y * ZS];
const Paper: React.FC<{ children?: React.ReactNode; shade?: number }> = ({ children, shade = 0 }) => (
  <AbsoluteFill style={{ background: PAPER, overflow: "hidden" }}>
    <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(35,32,28,0.13) 2px, transparent 2.5px)", backgroundSize: "54px 54px", backgroundPosition: "27px 27px" }} />
    <svg width={W} height={60} style={{ position: "absolute", top: 18, left: 0 }}>{Array.from({ length: 14 }, (_, i) => <ellipse key={i} cx={60 + i * 74} cy={30} rx={14} ry={22} fill="none" stroke="rgba(35,32,28,0.35)" strokeWidth={4} />)}</svg>
    <AbsoluteFill style={{ transform: `translateY(${ZY}px) scale(${ZS})`, transformOrigin: "540px 0px" }}>{children}</AbsoluteFill>
    {shade > 0 && <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(0,0,0,${0.25 * shade}), rgba(0,0,0,0))` }} />}
  </AbsoluteFill>
);

/* ---------------- the pencil's path: it follows whatever is being drawn ---------------- */
const REG: Record<string, [number, number, number, number]> = { // x, y, w, h of what each stroke draws
  hookFrame: [60, 360, 960, 560], headline: [160, 430, 760, 400], whoforHead: [140, 300, 800, 300], sign: [120, 720, 220, 230], van: [410, 750, 260, 180], website: [715, 730, 230, 170],
  phone: [225, 1100, 150, 260], shirt: [630, 1120, 280, 250], clipboard: [150, 280, 280, 360], conceptsHead: [190, 700, 700, 120], conceptA: [100, 950, 220, 220], conceptB: [410, 950, 220, 220],
  conceptC: [720, 950, 220, 220], chooseRing: [370, 910, 300, 300], chooseText: [270, 1300, 540, 100], reviseHead: [170, 300, 740, 120], redraw1: [520, 780, 40, 240], redraw2: [480, 880, 120, 100],
  formatsHead: [190, 300, 700, 120], paletteHead: [200, 300, 680, 120], sw0: [90, 590, 180, 180], sw1: [330, 590, 180, 180], sw2: [570, 590, 180, 180], sw3: [810, 590, 180, 180], aa: [140, 900, 800, 280],
  kitHead: [320, 290, 440, 140], card: [110, 1060, 240, 140], social: [520, 1050, 400, 150], signature: [110, 1360, 240, 90], invoice: [610, 1340, 220, 150],
  tagStarter: [200, 470, 460, 320], tagKit: [420, 900, 460, 320], ownQ: [180, 420, 720, 120], ownYes: [240, 700, 600, 260], logoSketch: [220, 300, 640, 640], logoInk: [220, 300, 640, 640], endLine: [230, 1010, 620, 220],
};
const REST: [number, number, number][] = [[0, 880, 1560], [4, 900, 1600], [8, 880, 1560], [15, 860, 1560], [18, 160, 1600], [22, 900, 1580], [26, 900, 1640], [30, 170, 1600], [33, 880, 1560], [36, 880, 1560]];
const restAt = (t: number) => { let r = REST[0]; for (const x of REST) if (t >= x[0]) r = x; return [r[1], r[2]]; };
const pencilAt = (t: number, tr: number): [number, number, boolean] => {
  const evs = Object.entries(CUE.DRAW).filter(([k]) => REG[k]).map(([k, [s, d, kind]]) => ({ k, s: s as number, d: d as number, kind }));
  const cur = evs.find((e) => t >= e.s && t <= e.s + e.d);
  if (cur) {
    const [x, y, w, h] = REG[cur.k], q = (t - cur.s) / cur.d;
    if (cur.kind === "write") { const lines = Math.max(1, Math.round(h / 110)), li = Math.min(lines - 1, Math.floor(q * lines)), lq = q * lines - li; return [x + w * lq, y + 40 + li * (h / lines) + Math.sin(t * 60) * 10, true]; }
    const a = q * Math.PI * 2 - Math.PI / 2; return [x + w / 2 + Math.cos(a) * w / 2, y + h / 2 + Math.sin(a) * h / 2, true];
  }
  // glide between strokes, or rest in the corner
  const prev = [...evs].reverse().find((e) => e.s + e.d < t), next = evs.find((e) => e.s > t);
  const [rx, ry] = restAt(t);
  const endOf = (e: typeof evs[0]) => { const [x, y, w, h] = REG[e.k]; return e.kind === "write" ? [x + w, y + h - 40] : [x + w / 2, y]; };
  const startOf = (e: typeof evs[0]) => { const [x, y, w, h] = REG[e.k]; return e.kind === "write" ? [x, y + 40] : [x + w / 2, y]; };
  if (prev && next && next.s - (prev.s + prev.d) < 0.9) { const k = io(clamp((t - prev.s - prev.d) / (next.s - prev.s - prev.d))); const [ax, ay] = endOf(prev), [bx, by] = startOf(next); return [ax + (bx - ax) * k, ay + (by - ay) * k - Math.sin(Math.PI * k) * 80, false]; }
  if (prev && t - (prev.s + prev.d) < 0.45) { const k = io(clamp((t - prev.s - prev.d) / 0.45)); const [ax, ay] = endOf(prev); return [ax + (rx - ax) * k, ay + (ry - ay) * k, false]; }
  if (next && next.s - t < 0.45) { const k = io(clamp(1 - (next.s - t) / 0.45)); const [bx, by] = startOf(next); return [rx + (bx - rx) * k, ry + (by - ry) * k, false]; }
  return [rx, ry + Math.sin(tr * 3) * 14, false];
};

export const BrandFilm: React.FC = () => {
  const f = useCurrentFrame(), tr = f / BRAND_FPS, t = CUE.unmap(tr); // t: authoring time (pauses during holds)
  // which scene owns time tt (transitions are handled separately below)
  const idx = (tt: number) => { let i = 0; SCENE_LIST.forEach(([k], j) => { if (tt >= CUE.SCENES[k][0]) i = j; }); return i; };
  const sceneAt = (i: number, tt: number) => { const Sc = SCENE_LIST[i][1]; return <Sc t={tt} f={f} />; };
  const trans = TRANS.find(([s, d]) => t >= s && t < s + d);
  let body: React.ReactNode;
  if (trans) {
    const [s, d, kind] = trans, q = io(clamp((t - s) / d));
    const fromI = idx(s - 0.01), toI = Math.min(SCENE_LIST.length - 1, fromI + 1);
    const out = sceneAt(fromI, t);
    const top = kind === "flip"
      ? <AbsoluteFill style={{ transformOrigin: "0% 50%", transform: `perspective(2600px) rotateY(${-178 * q}deg)`, opacity: q > 0.5 ? 0 : 1 }}><Paper shade={q * 2}>{out}</Paper></AbsoluteFill>
      : kind === "slide" ? <AbsoluteFill style={{ transform: `translateY(${-H * q}px) rotate(${-4 * q}deg)` }}><Paper>{out}</Paper></AbsoluteFill>
        : <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${q * 100}%)` }}><Paper>{out}</Paper></AbsoluteFill>;
    body = <><Paper>{sceneAt(toI, t)}</Paper>{top}</>;
  } else body = <Paper>{sceneAt(idx(t), t)}</Paper>;

  // cast
  // during a reading hold the pencil steps aside to its resting spot, then returns as the story resumes
  let [px0, py0, drawing] = pencilAt(t, tr);
  { let cum = 0; for (const [hp, ex] of CUE.HOLDS) { const a = hp + cum, z = a + ex; if (tr >= a && tr < z) { const k = io(clamp((tr - a) / 0.4)) * io(clamp((z - tr) / 0.4)); const [rx, ry] = restAt(hp); px0 += (rx - px0) * k; py0 += (ry + Math.sin(tr * 3) * 14 - py0) * k; drawing = drawing && k < 0.5; } cum += ex; } }
  const entry = clamp(t / 0.45), [px, py] = toFrame(px0, py0);
  const pX = t < 0.45 ? 1200 + (px - 1200) * io(entry) : px, pY = t < 0.45 ? 2200 + (py - 2200) * io(entry) : py;
  const boing = CUE.BOING.reduce((m, b) => Math.max(m, t >= b && t < b + 0.5 ? Math.sin((t - b) * 30) * Math.exp(-(t - b) * 8) : 0), 0);
  const mood = t > 7.0 && t < 7.6 ? "sad" : t > 38.8 ? "wink" : "happy";
  const eraseNow = [[7.6, 0.4, "wipe"], [16.0, 0.4, "rub"], [17.0, 0.35, "rub"], [25.6, 0.4, "wipe"]].find(([s, d]) => t >= (s as number) - 0.25 && t < (s as number) + (d as number) + 0.25);
  let eraser: React.ReactNode = null;
  if (eraseNow) {
    const [s, d, kind] = eraseNow as [number, number, string], q = clamp((t - s) / d);
    const ex = kind === "wipe" ? -120 + q * 1320 : 540 + Math.sin(q * Math.PI * 6) * 90, ey = kind === "wipe" ? 960 + Math.sin(q * Math.PI * 5) * 520 : 900 + Math.cos(q * Math.PI * 6) * 30;
    const [fx, fy] = kind === "wipe" ? [ex, ey] : toFrame(ex, ey);
    eraser = <Eraser x={fx} y={fy} rot={Math.sin(t * 30) * 8} f={f} />;
  }
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      {body}
      {eraser}
      <Pencil x={pX} y={pY} rot={drawing ? 28 + Math.sin(t * 40) * 4 : 28 + Math.sin(tr * 2) * 6} f={f} mood={mood} s={0.9} squash={boing} />
      <Audio src={staticFile("brand/sound.wav")} />
    </AbsoluteFill>
  );
};
