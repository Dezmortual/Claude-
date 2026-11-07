import React from "react";
import { AbsoluteFill, Audio, Freeze, Img, interpolate, OffthreadVideo, random, staticFile, useCurrentFrame } from "remotion";
import { MLogo } from "../lib";
import events from "../../public/social/events.json";
import pieceBg from "../../public/social/piece-bg.json";

/* "A glance inside": manywright.com/services/social-and-email/, recorded for real in an iPhone 15 Pro
   emulation (public/social/recording.mp4, see scripts/social/). Every piece that breaks out of the phone is an
   element screenshot of the live page; every tap ripple sits on a logged tap. 48 s, 120 BPM. */

export const SOCIAL_FPS = 60;
export const SOCIAL_FRAMES = 48 * 60;
const C = { navy: "#0F1B2D", deep: "#0A1422", amber: "#F5A524", coral: "#F0675A", ice: "#F4F6FA", pink: "#FFE9E6", dust: "#CFC8BC", grey: "#EEF0F4", white: "#F7F8FA", ink: "#14202F" };
const DISPLAY = "'Archivo', 'Arial Narrow', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

type Rect = { x: number; y: number; w: number; h: number };
const ev = events as { t: number; type: string; key?: string; rect?: Rect; x?: number; y?: number }[];
const rectOf = (key: string) => ev.find((e) => e.key === key)!.rect!;
const taps = ev.filter((e) => e.type === "tap");

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x: number) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const outExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const ip = (t: number, a: number, b: number, from: number, to: number, ease = io) => from + (to - from) * ease(clamp((t - a) / (b - a)));

/* ---------------- the phone ---------------- */
const SCR_W = 393, SCR_H = 852, STATUS = 54, WEB_H = 740, BEZ = 14;
type Pose = { x: number; y: number; s: number; rx: number; ry: number; rz: number };
const P0: Pose = { x: 540, y: 1120, s: 0.95, rx: 0, ry: 0, rz: 0 };
const KEYS: [number, Partial<Pose>][] = [
  [0, { x: 540, y: 2500, s: 0.55, rx: 55, rz: -12 }],
  [0.85, P0], [3.0, P0],
  [3.5, { y: 1130, s: 0.92, rz: -3 }], [5.9, { y: 1130, s: 0.92, rz: -3 }],
  ...Array.from({ length: 6 }, (_, i) => [6.4 + i * 2.5, { y: 1150, s: 0.95, rz: 0, ry: i % 2 ? -9 : 9 }] as [number, Partial<Pose>]),
  [20.9, { y: 1120, s: 0.95, ry: 0 }], [21.6, { y: 1080, s: 0.98 }], [22.35, { y: 1080, s: 0.98 }],
  [23.0, { x: 280, y: 1270, s: 0.6, ry: 18 }], [27.5, { x: 280, y: 1270, s: 0.6, ry: 18 }],
  [28.1, { x: 540, y: 1180, s: 0.74, ry: 0 }], [30.0, { x: 540, y: 1180, s: 0.74 }],
  [30.5, { x: 820, y: 1420, s: 0.55, ry: -14 }], [33.5, { x: 820, y: 1420, s: 0.55, ry: -14 }],
  [34.0, { x: 820, y: 1420, s: 0.55, ry: -14 }], [36.4, { x: 820, y: 1420, s: 0.55, ry: -14 }],
  [36.9, { x: 540, y: 1150, s: 0.92, ry: 0 }], [41.3, { y: 1150, s: 0.92 }],
  [41.8, { y: 1180, s: 0.74 }], [44.4, { y: 1180, s: 0.74 }],
  [45.0, { y: 960, s: 1.02 }], [45.9, { y: 960, s: 1.02 }],
  [46.6, { y: 2700, s: 0.5, rx: -35, rz: 10 }],
];
// resolve partial keys into full poses (carry previous values forward)
const FULL: [number, Pose][] = (() => { let cur = { ...P0 }; return KEYS.map(([t, p]) => { cur = { ...cur, ...p }; return [t, { ...cur }]; }); })();
const pose = (t: number): Pose => {
  if (t <= FULL[0][0]) return FULL[0][1];
  for (let i = 0; i < FULL.length - 1; i++) {
    const [ta, a] = FULL[i], [tb, b] = FULL[i + 1];
    if (t <= tb) { const k = io(clamp((t - ta) / (tb - ta))); const o = {} as Pose; (Object.keys(a) as (keyof Pose)[]).forEach((n) => (o[n] = a[n] + (b[n] - a[n]) * k)); return o; }
  }
  return FULL[FULL.length - 1][1];
};
// a point in the page viewport (CSS px) → composition px (rotation ignored: pieces launch while the phone is near-flat)
const toComp = (p: Pose, cx: number, cy: number) => ({ x: p.x + (cx - SCR_W / 2) * p.s, y: p.y + (STATUS + cy - SCR_H / 2) * p.s });

const Phone: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const p = pose(t);
  const stale = ip(t, 3.3, 3.9, 0, 1) * (1 - ip(t, 5.9, 6.3, 0, 1));
  const video = <OffthreadVideo src={staticFile("social/recording.mp4")} muted style={{ width: SCR_W, height: WEB_H, display: "block" }} />;
  return (
    <div style={{ position: "absolute", left: p.x, top: p.y, width: 0, height: 0, perspective: 2200 }}>
      <div style={{
        position: "absolute", left: -(SCR_W / 2 + BEZ), top: -(SCR_H / 2 + BEZ), width: SCR_W + 2 * BEZ, height: SCR_H + 2 * BEZ, borderRadius: 66,
        background: "linear-gradient(140deg, #3a3f47, #15181d 45%, #2b3038)", boxShadow: "0 60px 120px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.08) inset",
        transform: `scale(${p.s}) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg)`,
      }}>
        <div style={{ position: "absolute", left: BEZ, top: BEZ, width: SCR_W, height: SCR_H, borderRadius: 54, overflow: "hidden", background: "#fff" }}>
          {/* status bar */}
          <div style={{ height: STATUS, background: t < 44.6 && t > 0 ? "#0F1B2D" : "#0F1B2D", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 34px", fontFamily: DISPLAY, fontVariationSettings: "'wdth' 100, 'wght' 650", fontSize: 17, color: "#fff" }}>
            <span>9:41</span>
            <div style={{ width: 120, height: 34, borderRadius: 20, background: "#000", position: "absolute", left: SCR_W / 2 - 60, top: 10 }} />
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>{[6, 9, 12, 15].map((h) => <i key={h} style={{ width: 3, height: h, background: "#fff", borderRadius: 1 }} />)}</span>
              <span style={{ width: 26, height: 13, border: "1.5px solid #fff", borderRadius: 4, padding: 1.5, boxSizing: "border-box" }}><i style={{ display: "block", width: "80%", height: "100%", background: "#fff", borderRadius: 2 }} /></span>
            </span>
          </div>
          <div style={{ height: WEB_H, overflow: "hidden", filter: stale > 0.01 ? `grayscale(${0.85 * stale}) sepia(${0.35 * stale}) brightness(${1 - 0.08 * stale})` : undefined }}>
            {t < 46.4 ? video : <Freeze frame={Math.round(46.4 * SOCIAL_FPS)}>{video}</Freeze>}
          </div>
          {/* Safari-style address bar */}
          <div style={{ height: SCR_H - STATUS - WEB_H, background: "#F2F2F4", borderTop: "1px solid #ddd", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 330, height: 38, borderRadius: 12, background: "#E3E3E8", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: DISPLAY, fontVariationSettings: "'wdth' 100, 'wght' 500", fontSize: 16, color: "#111" }}>
              <svg width="10" height="13" viewBox="0 0 10 13"><rect x="0.5" y="5.5" width="9" height="7" rx="1.5" fill="#111" /><path d="M2.5 5.5 V3.5 a2.5 2.5 0 0 1 5 0 V5.5" fill="none" stroke="#111" strokeWidth="1.3" /></svg>
              manywright.com
            </div>
          </div>
          {/* glass sheen */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 35%)", pointerEvents: "none" }} />
        </div>
      </div>
    </div>
  );
};

/* ---------------- taps: a finger dot and ripples, on the logged coordinates ---------------- */
const Taps: React.FC<{ t: number }> = ({ t }) => (
  <>
    {taps.map((e, i) => {
      const dt = t - e.t;
      if (dt < -0.35 || dt > 0.9) return null;
      const p = pose(e.t), c = toComp(p, e.x!, e.y!);
      const approach = clamp((dt + 0.35) / 0.35);
      const press = dt >= 0 ? Math.max(0, 1 - dt / 0.25) : 0;
      return (
        <React.Fragment key={i}>
          <div style={{ position: "absolute", left: c.x - 34, top: c.y - 34, width: 68, height: 68, borderRadius: 34, background: "rgba(255,255,255,0.55)", border: "3px solid rgba(15,27,45,0.65)", opacity: dt < 0.45 ? approach : Math.max(0, 1 - (dt - 0.45) / 0.3), transform: `scale(${1.25 - 0.25 * approach - 0.18 * press}) translate(${(1 - approach) * 40}px, ${(1 - approach) * 60}px)` }} />
          {[0, 0.12, 0.24].map((d) => { const q = dt - d; return q > 0 && q < 0.6 ? <div key={d} style={{ position: "absolute", left: c.x - 40, top: c.y - 40, width: 80, height: 80, borderRadius: 40, border: `4px solid ${C.amber}`, opacity: 1 - q / 0.6, transform: `scale(${1 + q * 4})` }} /> : null; })}
        </React.Fragment>
      );
    })}
  </>
);

/* ---------------- pieces of the real page breaking out ---------------- */
type Move = [number, number, number, number]; // [t, cx, cy, width]
type PieceDef = { src: string; name: string; css: [number, number]; tIn: number; tOut: number; from: Rect; at: [number, number]; w: number; rot?: number; moves?: Move[]; exit?: "up" | "left" | "fade"; radius?: number; behind?: boolean; opacity?: number; pad?: number; bg?: string; feather?: boolean };
const META: Record<string, [number, number]> = {
  heroH1: [361, 115], heroPrice: [361, 42], heroArt: [361, 289], whoforP: [361, 136], card0: [361, 131], card1: [361, 131], card2: [361, 154], card3: [361, 131], card4: [361, 131], card5: [361, 154],
  starter: [361, 342], plus: [361, 413], founding: [361, 248], step0: [361, 154], step1: [361, 130], step2: [361, 154], step3: [361, 154],
  role0: [361, 100], role1: [361, 100], role2: [361, 100], role3: [361, 100], role4: [361, 100], faq1: [361, 171], faq4: [361, 199], cta: [361, 263],
  starter_price_hi: [104.6, 34.4], plus_price_hi: [132.4, 33.4], starter_limits_hi: [203.6, 39.9], plus_limits_hi: [203.6, 39.9],
};
const BGS = pieceBg as Record<string, string>;
// soft edges for pieces cut from the hero's glowing background, so they melt into the navy card
// (only the right side: the headline text starts at the image's left edge and ends by ~65% of its width)
const FEATHER: React.CSSProperties = { WebkitMaskImage: "linear-gradient(to right, #000 0, #000 76%, transparent 100%)" };
const piece = (name: string, o: Omit<PieceDef, "src" | "css" | "name">): PieceDef => ({ src: `social/pieces/${name}.png`, name, css: META[name], bg: BGS[name], ...o });
const PIECES: PieceDef[] = [
  piece("heroArt", { tIn: 2.0, tOut: 3.0, from: { x: 16, y: 700, w: 361, h: 289 }, at: [540, 1000], w: 1600, behind: true, opacity: 0.32, exit: "fade" }),
  piece("heroH1", { tIn: 0.95, tOut: 3.0, from: rectOf("hero"), at: [520, 385], w: 760, pad: 36, bg: "#0F1B2D", feather: true }),
  piece("heroPrice", { tIn: 1.6, tOut: 3.0, from: { x: 16, y: 512, w: 361, h: 42 }, at: [520, 625], w: 760, pad: 26, bg: "#0F1B2D" }),
  piece("whoforP", { tIn: 3.8, tOut: 6.0, from: rectOf("whofor"), at: [520, 450], w: 740, pad: 40 }),
  ...[0, 1, 2, 3, 4, 5].map((i) => piece(`card${i}`, { tIn: 6.8 + i * 2.5, tOut: 9.0 + i * 2.5, from: rectOf(`card${i}`), at: [520, 455], w: 820, rot: i % 2 ? 1.2 : -1.2 })),
  piece("starter", { tIn: 23.2, tOut: 25.45, from: rectOf("starter"), at: [620, 700], w: 560, exit: "left", rot: -1.5 }),
  piece("starter_price_hi", { tIn: 23.6, tOut: 25.45, from: { x: 25, y: 154, w: 105, h: 34 }, at: [520, 318], w: 460, pad: 20 }),
  piece("starter_limits_hi", { tIn: 23.85, tOut: 25.45, from: { x: 121, y: 309, w: 204, h: 40 }, at: [600, 1100], w: 500, pad: 20 }),
  piece("plus", { tIn: 25.45, tOut: 27.75, from: rectOf("plus"), at: [620, 720], w: 540, rot: 1.5 }),
  piece("plus_price_hi", { tIn: 25.85, tOut: 27.75, from: { x: 25, y: 154, w: 132, h: 33 }, at: [520, 318], w: 520, pad: 20 }),
  piece("plus_limits_hi", { tIn: 26.1, tOut: 27.75, from: { x: 121, y: 380, w: 204, h: 40 }, at: [600, 1110], w: 500, pad: 20 }),
  piece("founding", { tIn: 27.85, tOut: 30.25, from: rectOf("founding"), at: [520, 500], w: 800 }),
  // how it works: one readable column on the left, the phone bottom-right
  ...[0, 1, 2, 3].map((i) => piece(`step${i}`, { tIn: 30.3 + i * 0.3, tOut: 33.55, from: { x: 16, y: 150 + i * 120, w: 361, h: 140 }, at: [360, [371, 628, 885, 1157][i]] as [number, number], w: 520, pad: 20 })),
  // the line-up: five rows, no overlaps
  ...[0, 1, 2, 3, 4].map((i) => piece(`role${i}`, { tIn: 33.75 + i * 0.15, tOut: 36.55, from: { x: 16, y: 120 + i * 100, w: 361, h: 100 }, at: [360, 322 + i * 196], w: 520, pad: 20, rot: i % 2 ? 1 : -1 })),
  piece("faq1", { tIn: 37.75, tOut: 40.35, from: rectOf("faq1open"), at: [520, 470], w: 740, pad: 34, moves: [[39.75, 520, 375, 520]] }),
  piece("faq4", { tIn: 39.75, tOut: 42.0, from: rectOf("faq4open"), at: [520, 760], w: 680, pad: 30, moves: [[40.4, 520, 500, 740]] }),
  piece("cta", { tIn: 41.9, tOut: 44.5, from: rectOf("cta"), at: [520, 535], w: 760, pad: 36 }),
];

const Piece: React.FC<{ d: PieceDef; t: number }> = ({ d, t }) => {
  if (t < d.tIn || t > d.tOut + 0.4) return null;
  const p0 = pose(d.tIn), o = toComp(p0, d.from.x + d.from.w / 2, d.from.y + d.from.h / 2), w0 = d.from.w * p0.s;
  // launch: lift off the screen (0–0.18 s), then fly to the stage with overshoot (0.18–0.7 s)
  const lift = clamp((t - d.tIn) / 0.18), fly = clamp((t - d.tIn - 0.12) / 0.55);
  let cx = o.x + (d.at[0] - o.x) * outBack(fly), cy = o.y + (d.at[1] - o.y) * outBack(fly), w = w0 + (d.w - w0) * outExpo(fly);
  for (const [mt, mx, my, mw] of d.moves || []) { const k = io(clamp((t - mt) / 0.45)); cx += (mx - cx) * k; cy += (my - cy) * k; w += (mw - w) * k; }
  const out = clamp((t - d.tOut) / 0.32);
  let ex = 0, ey = 0, eo = 1, es = 1;
  if (out > 0) {
    if (d.exit === "left") { ex = -900 * io(out); es = 1 - 0.3 * out; }
    else if (d.exit === "fade") { eo = 1 - out; es = 1 + 0.15 * out; }
    else { ey = -700 * io(out); eo = 1 - out; es = 1 - 0.2 * out; }
  }
  const h = (w * d.css[1]) / d.css[0];
  const pd = ((d.pad ?? 0) * w) / d.w; // padding scales with the piece as it flies
  const tiltX = (1 - fly) * 38 + Math.sin((t - d.tIn) * 1.7) * 2.2 * fly;
  const tiltY = Math.cos((t - d.tIn) * 1.3) * 3 * fly;
  const shadow = 10 + 50 * fly;
  return (
    <div style={{ position: "absolute", left: cx + ex, top: cy + ey, width: 0, height: 0, perspective: 1600, opacity: (d.opacity ?? 1) * eo * clamp(lift * 3) }}>
      <div style={{
        position: "absolute", left: -w / 2 - pd, top: -h / 2 - pd, width: w + 2 * pd, height: h + 2 * pd, padding: pd, boxSizing: "border-box",
        background: pd > 0 ? d.bg : undefined, borderRadius: pd > 0 ? 22 : d.radius ?? 14, overflow: "hidden",
        transform: `scale(${(1 + 0.06 * lift * (1 - fly)) * es}) rotateX(${tiltX}deg) rotateY(${tiltY}deg) rotate(${(d.rot ?? 0) * fly}deg)`,
        boxShadow: d.behind ? undefined : `0 ${shadow * 0.6}px ${shadow * 1.6}px rgba(10,20,34,${0.18 + 0.22 * fly})`,
      }}>
        <Img src={staticFile(d.src)} style={{ display: "block", width: w, height: h, borderRadius: pd > 0 ? 0 : d.radius ?? 14, ...(d.feather ? FEATHER : {}) }} />
      </div>
    </div>
  );
};

/* ---------------- the world around the phone ---------------- */
const BG: [number, string][] = [[0, C.navy], [3, C.dust], [6, C.pink], [21, C.navy], [27.8, C.deep], [30.3, C.navy], [33.7, C.grey], [36.6, C.white], [41.8, C.navy]];
const hexMix = (a: string, b: string, k: number) => { const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16); return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k)).join(",")})`; };
const bgAt = (t: number) => { let i = 0; while (i + 1 < BG.length && BG[i + 1][0] <= t) i++; const prev = i ? BG[i - 1][1] : BG[0][1]; return hexMix(prev, BG[i][1], clamp((t - BG[i][0]) / 0.35)); };
const win = (t: number, a: number, b: number, fade = 0.3) => clamp((t - a) / fade) * (1 - clamp((t - b) / fade));
const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: "absolute", fontFamily: MONO, fontSize: 30, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", ...style }}>{children}</div>
);

const World: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const layers: React.ReactNode[] = [];
  // hero: the site's dark grid, rushing toward camera
  const g0 = win(t, -1, 3.1);
  if (g0 > 0) layers.push(<AbsoluteFill key="grid" style={{ opacity: g0, backgroundImage: "linear-gradient(rgba(244,246,250,0.07) 2px, transparent 2px), linear-gradient(90deg, rgba(244,246,250,0.07) 2px, transparent 2px)", backgroundSize: `${90 + t * 25}px ${90 + t * 25}px`, backgroundPosition: "center" }} />);
  // who it's for: dust and a stale vignette
  const g1 = win(t, 3.1, 6.0);
  if (g1 > 0) layers.push(
    <AbsoluteFill key="dust" style={{ opacity: g1 }}>
      {Array.from({ length: 70 }, (_, i) => <div key={i} style={{ position: "absolute", left: random(`dx${i}`) * 1080, top: ((random(`dy${i}`) * 1920 - t * 40 * (0.5 + random(`ds${i}`))) % 1920 + 1920) % 1920, width: 4 + random(`dw${i}`) * 8, height: 4 + random(`dw${i}`) * 8, borderRadius: 8, background: "rgba(90,80,60,0.35)" }} />)}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(80,70,50,0.35) 100%)" }} />
    </AbsoluteFill>);
  // card 0 — a planned calendar: the world becomes the month, the 25th lights up
  const c0 = win(t, 6.5, 9.2);
  if (c0 > 0) layers.push(
    <AbsoluteFill key="cal" style={{ opacity: c0 }}>
      {Array.from({ length: 35 }, (_, i) => {
        const col = i % 7, row = Math.floor(i / 7), on = clamp((t - 6.9 - i * 0.035) / 0.2), is25 = i === 22;
        return <div key={i} style={{ position: "absolute", left: 20 + col * 150, top: 700 + row * 150, width: 136, height: 136, borderRadius: 18, border: `3px solid rgba(240,103,90,${0.25 + 0.3 * on})`, background: is25 ? `rgba(245,165,36,${on})` : i % 3 === 0 ? `rgba(240,103,90,${0.22 * on})` : "transparent", transform: `scale(${0.6 + 0.4 * on}${is25 ? ` ) scale(${1 + 0.18 * Math.sin(clamp((t - 7.6) / 0.4) * Math.PI)}` : ""})` }} />;
      })}
      <Label style={{ left: 20 + 1 * 150 + 20, top: 700 + 3 * 150 + 46, fontSize: 40, color: C.navy, fontFamily: DISPLAY, letterSpacing: 0, fontVariationSettings: "'wdth' 110, 'wght' 800", opacity: clamp((t - 7.4) / 0.2) }}>25th</Label>
    </AbsoluteFill>);
  // card 1 — captions and graphics, sized for each platform
  const c1 = win(t, 9.0, 11.7);
  if (c1 > 0) layers.push(
    <AbsoluteFill key="frames" style={{ opacity: c1 }}>
      {[[260, 260, -1], [240, 300, 0], [190, 338, 1]].map(([w, h, k], i) => {
        const a = (t - 9) * 0.9 + i * 2.1, x = 540 + Math.cos(a) * 400 - w / 2, y = 1150 + Math.sin(a) * 300 - h / 2, z = Math.sin(a);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 18, background: "#fff", boxShadow: "0 20px 40px rgba(15,27,45,0.18)", transform: `scale(${0.8 + 0.25 * (z + 1) / 2}) rotate(${k * 6}deg)`, zIndex: z > 0 ? 2 : 0, padding: 14, boxSizing: "border-box" }}>
            <div style={{ height: "62%", borderRadius: 10, background: [`linear-gradient(135deg, ${C.coral}, ${C.amber})`, `linear-gradient(135deg, ${C.navy}, #2E5BFF)`, `linear-gradient(135deg, ${C.amber}, ${C.coral})`][i] }} />
            {[0.9, 0.7, 0.5].map((q, j) => <div key={j} style={{ height: 10, width: `${q * 100}%`, borderRadius: 5, background: "#d9dde4", marginTop: 10 }} />)}
          </div>
        );
      })}
    </AbsoluteFill>);
  // card 2 — scheduled for you: posts drop into slots, a clock sweeps
  const c2 = win(t, 11.5, 14.2);
  if (c2 > 0) layers.push(
    <AbsoluteFill key="sched" style={{ opacity: c2 }}>
      <svg width="1080" height="1920" style={{ position: "absolute", inset: 0 }}>
        <circle cx="900" cy="1500" r="230" fill="none" stroke="rgba(15,27,45,0.18)" strokeWidth="16" />
        <line x1="900" y1="1500" x2={900 + Math.cos((t - 11.5) * 2.6 - 1.57) * 190} y2={1500 + Math.sin((t - 11.5) * 2.6 - 1.57) * 190} stroke={C.coral} strokeWidth="14" strokeLinecap="round" />
        <line x1="40" y1="790" x2="1040" y2="790" stroke="rgba(15,27,45,0.18)" strokeWidth="6" />
      </svg>
      {Array.from({ length: 7 }, (_, i) => { const d = clamp((t - 11.8 - i * 0.22) / 0.3); return <div key={i} style={{ position: "absolute", left: 70 + i * 140, top: 740 - (1 - outBack(d)) * 260, width: 100, height: 100, borderRadius: 16, background: i % 2 ? C.amber : C.coral, opacity: d, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 54, fontFamily: DISPLAY, fontVariationSettings: "'wght' 900" }}>✓</div>; })}
    </AbsoluteFill>);
  // card 3 — seasonal promotions: the world changes season
  const c3 = win(t, 14.0, 16.7);
  if (c3 > 0) {
    const pal = ["#FFD9C7", "#FFE9A8", "#CDE7D8", "#D7DEFF"], k = (t - 14) / 0.55, i0 = Math.floor(k) % 4, i1 = (i0 + 1) % 4;
    layers.push(
      <AbsoluteFill key="season" style={{ opacity: c3, background: hexMix(pal[i0], pal[i1], io(k % 1)) }}>
        {["Holidays", "Slow months", "Local events"].map((s, i) => { const d = outBack(clamp((t - 14.25 - i * 0.35) / 0.4)); return <Label key={s} style={{ left: 36, top: 880 + i * 150, transform: `translateX(${(1 - d) * -420}px) rotate(${i % 2 ? 3 : -3}deg)`, color: C.navy, fontSize: 30, background: "#fff", padding: "16px 22px", borderRadius: 40, boxShadow: "0 10px 30px rgba(15,27,45,0.15)" }}>{s}</Label>; })}
      </AbsoluteFill>);
  }
  // card 4 — short videos: two vertical clips play beside the phone
  const c4 = win(t, 16.5, 19.2);
  if (c4 > 0) layers.push(
    <AbsoluteFill key="vids" style={{ opacity: c4 }}>
      {[0, 1].map((i) => { const d = outBack(clamp((t - 16.7 - i * 0.15) / 0.5)); return (
        <div key={i} style={{ position: "absolute", left: i ? 760 : 40, top: 820, width: 280, height: 500, borderRadius: 28, background: `linear-gradient(160deg, ${i ? C.navy : C.coral}, ${i ? "#2E5BFF" : C.amber})`, transform: `translateX(${(1 - d) * (i ? 300 : -300)}px) rotate(${i ? 7 : -7}deg)`, boxShadow: "0 30px 60px rgba(15,27,45,0.25)", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 100, top: 200, width: 0, height: 0, borderLeft: "70px solid rgba(255,255,255,0.92)", borderTop: "42px solid transparent", borderBottom: "42px solid transparent" }} />
          <div style={{ position: "absolute", left: 20, right: 20, bottom: 26, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.35)" }}><div style={{ width: `${clamp((t - 16.8) / 2.2) * 100}%`, height: "100%", borderRadius: 4, background: "#fff" }} /></div>
        </div>); })}
    </AbsoluteFill>);
  // card 5 — email newsletter: envelopes fly out of the phone to a crowd of subscribers
  const c5 = win(t, 19.0, 21.7);
  if (c5 > 0) {
    const p = pose(t);
    layers.push(
      <AbsoluteFill key="mail" style={{ opacity: c5 }}>
        {Array.from({ length: 60 }, (_, i) => <div key={`d${i}`} style={{ position: "absolute", left: 60 + (i % 12) * 86, top: 1560 + Math.floor(i / 12) * 60, width: 26, height: 26, borderRadius: 13, background: clamp((t - 19.6 - (i % 12) * 0.05) / 0.2) > 0.5 ? C.amber : "rgba(15,27,45,0.18)" }} />)}
        {Array.from({ length: 14 }, (_, i) => {
          const q = ((t - 19.1 - i * 0.12) / 0.9); if (q < 0 || q > 1) return null;
          const tx = 100 + (i % 12) * 86, ty = 1570, x = p.x + (tx - p.x) * q, y = p.y - 200 + (ty - p.y + 200) * q - Math.sin(q * Math.PI) * 500;
          return <svg key={i} width="90" height="64" viewBox="0 0 90 64" style={{ position: "absolute", left: x - 45, top: y - 32, transform: `rotate(${(q - 0.5) * 40}deg)` }}><rect x="2" y="2" width="86" height="60" rx="8" fill="#fff" stroke={C.coral} strokeWidth="4" /><path d="M6 8 L45 38 L84 8" fill="none" stroke={C.coral} strokeWidth="4" /></svg>;
        })}
      </AbsoluteFill>);
  }
  // packages: a spotlight and coin sparks on each price
  const pk = win(t, 22.2, 27.9);
  if (pk > 0) layers.push(
    <AbsoluteFill key="spot" style={{ opacity: pk }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 66% 38%, rgba(245,165,36,0.35) 0%, rgba(245,165,36,0) 45%)" }} />
      {[23.75, 26.0].map((tc) => Array.from({ length: 18 }, (_, i) => { const q = (t - tc) / 0.8; if (q < 0 || q > 1) return null; const a = (i / 18) * Math.PI * 2; return <div key={`${tc}-${i}`} style={{ position: "absolute", left: 560 + Math.cos(a) * q * 420, top: 310 + Math.sin(a) * q * 260, width: 16, height: 16, borderRadius: 8, background: C.amber, opacity: 1 - q }} />; }))}
    </AbsoluteFill>);
  // founding terms: the first five paying clients, as five lights
  const fd = win(t, 27.9, 30.3);
  if (fd > 0) layers.push(
    <AbsoluteFill key="five" style={{ opacity: fd }}>
      {[0, 1, 2, 3, 4].map((i) => { const on = clamp((t - 28.3 - i * 0.16) / 0.15); return <div key={i} style={{ position: "absolute", left: 140 + i * 180 - 50, top: 860, width: 100, height: 100, borderRadius: 50, border: `5px solid ${C.amber}`, background: `rgba(245,165,36,${on})`, boxShadow: on > 0.5 ? `0 0 50px ${C.amber}` : undefined, transform: `scale(${0.7 + 0.3 * outBack(on)})` }} />; })}
    </AbsoluteFill>);
  // how it works: a path drawn through the four steps
  const st = win(t, 30.3, 33.7);
  if (st > 0) layers.push(
    <svg key="path" width="1080" height="1920" style={{ position: "absolute", inset: 0, opacity: st }}>
      <path d="M 56 260 L 56 1290" fill="none" stroke={C.coral} strokeWidth="8" strokeDasharray="22 16" pathLength={1000} strokeDashoffset={1000 - 1000 * clamp((t - 30.4) / 1.2)} />
    </svg>);
  // line-up: rings radiating behind the deck
  const ln = win(t, 33.7, 36.6);
  if (ln > 0) layers.push(<AbsoluteFill key="rings" style={{ opacity: ln }}>{[0, 1, 2, 3].map((i) => { const q = ((t - 33.7) * 0.6 + i / 4) % 1; return <div key={i} style={{ position: "absolute", left: 540 - 700 * q, top: 600 - 700 * q, width: 1400 * q, height: 1400 * q, borderRadius: "50%", border: `3px solid rgba(15,27,45,${0.2 * (1 - q)})` }} />; })}</AbsoluteFill>);
  // FAQ: "you approve" — a giant check drawn behind; then 2 → 3 platforms as circles
  const fa = win(t, 37.1, 40.4);
  if (fa > 0) layers.push(
    <svg key="check" width="1080" height="1920" style={{ position: "absolute", inset: 0, opacity: fa * 0.9 }}>
      <circle cx="540" cy="1200" r="420" fill="none" stroke="rgba(245,165,36,0.35)" strokeWidth="26" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp((t - 37.2) / 0.7)} />
      <path d="M 330 1210 L 480 1360 L 770 1040" fill="none" stroke="rgba(245,165,36,0.55)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp((t - 37.7) / 0.5)} />
    </svg>);
  const pl = win(t, 39.9, 41.9);
  if (pl > 0) layers.push(
    <AbsoluteFill key="plat" style={{ opacity: pl }}>
      {[0, 1, 2].map((i) => { const on = i < 2 ? clamp((t - 40.0 - i * 0.2) / 0.25) : clamp((t - 40.9) / 0.25); return <div key={i} style={{ position: "absolute", left: 540 + (i - 1) * 260 - 150, top: 1460 - 150, width: 300, height: 300, borderRadius: 150, border: `8px solid ${i === 2 ? C.amber : C.coral}`, background: `rgba(${i === 2 ? "245,165,36" : "240,103,90"},0.12)`, transform: `scale(${outBack(on)})` }} />; })}
    </AbsoluteFill>);
  // call to action: rings from the tap
  const ca = win(t, 41.9, 46.2);
  if (ca > 0) layers.push(<AbsoluteFill key="cta" style={{ opacity: ca }}>{[0, 1, 2, 3, 4].map((i) => { const q = ((t - 43.0) * 0.5 + i / 5); if (t < 43) return null; const r = (q % 1) * 1300; return <div key={i} style={{ position: "absolute", left: 540 - r, top: 1180 - r, width: 2 * r, height: 2 * r, borderRadius: "50%", border: `3px solid rgba(245,165,36,${0.5 * (1 - (q % 1))})` }} />; })}</AbsoluteFill>);
  return <>{layers}</>;
};

/* ---------------- end card ---------------- */
const EndCard: React.FC<{ t: number }> = ({ t }) => {
  if (t < 45.9) return null;
  const a = (s: number, d = 0.35) => clamp((t - s) / d);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 330 }}>
      <div style={{ transform: `scale(${0.6 + 0.4 * outBack(a(46.0, 0.5))})`, opacity: a(46.0, 0.2), filter: "drop-shadow(0 0 30px rgba(245,165,36,0.45))" }}><MLogo height={190} /></div>
      <Label style={{ position: "relative", marginTop: 40, color: C.coral, fontSize: 26, opacity: a(46.25) }}>Service — Social posts and email newsletter</Label>
      <Img src={staticFile("social/pieces/heroH1.png")} style={{ width: 800, height: (800 * 115) / 361, marginTop: 34, opacity: a(46.4), transform: `translateY(${(1 - a(46.4)) * 40}px)`, ...FEATHER }} />
      <Img src={staticFile("social/pieces/heroPrice.png")} style={{ width: 780, height: (780 * 42) / 361, marginTop: 26, opacity: a(46.75), transform: `translateY(${(1 - a(46.75)) * 30}px)` }} />
      <div style={{ fontFamily: DISPLAY, fontVariationSettings: "'wdth' 110, 'wght' 750", fontSize: 64, color: C.ice, marginTop: 56, opacity: a(47.05) }}>manywright.com</div>
      <div style={{ width: 420 * a(47.2, 0.4), height: 5, background: C.amber, marginTop: 14 }} />
    </AbsoluteFill>
  );
};

export const SocialReel: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / SOCIAL_FPS;
  const behind = PIECES.filter((d) => d.behind), front = PIECES.filter((d) => !d.behind);
  // a light camera shake on the two impacts
  const sh = (at: number, dur: number, amp: number) => (t >= at && t < at + dur ? (1 - (t - at) / dur) ** 2 * amp : 0);
  const k = sh(0.85, 0.4, 14) + sh(22.0, 0.45, 18) + sh(46.0, 0.5, 20);
  const shake = `translate(${(random(`x${f}`) - 0.5) * 2 * k}px, ${(random(`y${f}`) - 0.5) * 2 * k}px)`;
  return (
    <AbsoluteFill style={{ background: bgAt(t), overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: shake }}>
        <World t={t} f={f} />
        {behind.map((d, i) => <Piece key={`b${i}`} d={d} t={t} />)}
        <Phone t={t} f={f} />
        <Taps t={t} />
        {front.map((d, i) => <Piece key={`p${i}`} d={d} t={t} />)}
        <EndCard t={t} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: Math.max(0, 1 - Math.abs(t - 22.0) / 0.12) * 0.5 + Math.max(0, 1 - Math.abs(t - 46.0) / 0.12) * 0.6, pointerEvents: "none" }} />
      <Audio src={staticFile("social/music.wav")} />
    </AbsoluteFill>
  );
};
