import React, { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { b, BF, FPS } from "../lib";
import { BRAND, glyph, iconPixels, mPixels, P, RGB, SERVICES, sprite, textWidth } from "./art";

/* A pixel-art particle piece for manywright.com. Everything is drawn on a tiny canvas
   (320x180, or 180x320 for Reels) and scaled up with hard pixel edges. Particle positions
   are pure functions of the frame, so renders are deterministic. */

export const N = 1600;
export type Pt = { x: number; y: number; c: RGB; a: number; s: number };
export type Form = { kind: "static"; pts: Pt[] } | { kind: "dyn"; fn: (i: number, t: number) => Pt };
export type Key = { at: number; form: Form; dur: number; stagger: number; order?: (p: Pt, i: number) => number };

export const hash = (i: number, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
export const outExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const mix = (a: RGB, c: RGB, t: number): RGB => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];

function buildWorld(LW: number, LH: number, V: boolean) {
  const CX = LW / 2, CY = LH / 2;
  const star = (i: number, t: number): Pt => ({
    x: hash(i, 1) * LW, y: hash(i, 2) * LH, c: hash(i, 3) > 0.8 ? P.ice : P.muted,
    a: (0.12 + 0.4 * hash(i, 4)) * (0.6 + 0.4 * Math.sin(t * 3 + i)), s: 1,
  });
  // a static formation: first pts.length particles take the points, the rest become stars
  const fill = (pts: Pt[]): Form => {
    const take = pts.length > N ? pts.filter((_, k) => k % Math.ceil(pts.length / N) === 0) : pts;
    const all: Pt[] = [];
    for (let i = 0; i < N; i++) all.push(i < take.length ? take[i] : star(i, 0));
    return { kind: "static", pts: all };
  };
  const stars: Form = { kind: "dyn", fn: (i, t) => star(i, t) };
  const explode = (cx: number, cy: number): Form => ({
    kind: "dyn",
    fn: (i, t) => {
      const ang = hash(i, 5) * Math.PI * 2, sp = 30 + hash(i, 6) * (V ? 200 : 220);
      const d = sp * (1 - Math.exp(-t * 3.5));
      return { x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d * (V ? 1.2 : 0.8), c: BRAND[i % 4], a: 1, s: hash(i, 7) > 0.7 ? 2 : 1 };
    },
  });

  // 199 blocks in a grid
  const grid = (() => {
    const cols = V ? 10 : 20, rows = V ? 20 : 10, sp = V ? 7 : 6;
    const pts: Pt[] = [];
    for (let n = 0; n < 199; n++) {
      const cx = (n % cols) - (cols - 1) / 2, cy = Math.floor(n / cols) - (rows - 1) / 2;
      pts.push({ x: CX + cx * sp - 1, y: CY - 8 + cy * sp - 1, c: n % 17 === 0 ? P.amber : P.ice, a: 1, s: 2 });
    }
    return pts;
  })();
  const gridBottom = CY - 8 + ((V ? 20 : 10) / 2) * (V ? 7 : 6) + 4;

  // the 13 disciplines as a bar chart (columns in landscape, rows in portrait)
  const DISC: [string, number][] = [["ENG", 57], ["SPC", 45], ["MKT", 25], ["SEC", 11], ["DES", 10], ["SAL", 9], ["TST", 9], ["ADS", 7], ["PM", 7], ["SUP", 7], ["PRD", 6], ["FIN", 5], ["RES", 1]];
  const barLabels: { s: string; x: number; y: number }[] = [];
  const bars = (() => {
    const pts: Pt[] = [];
    DISC.forEach(([lab, n], d) => {
      const col = BRAND[d % 4];
      for (let k = 0; k < n; k++) {
        const across = k % 3, along = Math.floor(k / 3);
        if (V) pts.push({ x: 40 + along * 3, y: 52 + d * 18 + across * 3, c: col, a: 1, s: 2 });
        else pts.push({ x: 34 + d * 20 + across * 3, y: 132 - along * 3, c: col, a: 1, s: 2 });
      }
      if (V) barLabels.push({ s: lab, x: 8, y: 52 + d * 18 });
      else barLabels.push({ s: lab, x: 34 + d * 20 + 4, y: 140 });
    });
    return pts;
  })();

  // ring of 199
  const ring: Pt[] = Array.from({ length: 199 }, (_, n) => {
    const a = (n / 199) * Math.PI * 2 - Math.PI / 2;
    return { x: CX + Math.cos(a) * (V ? 70 : 74) - 1, y: CY + Math.sin(a) * (V ? 95 : 62) - 1, c: n % 9 === 0 ? P.amber : P.ice, a: 1, s: 2 };
  });

  // "199" as dense particle digits
  const digits = (() => {
    const sc = V ? 6 : 8, w = textWidth("199", sc), x0 = Math.round(CX - w / 2), y0 = Math.round(CY - 10 - 3.5 * sc);
    const pts: Pt[] = [];
    [..."199"].forEach((ch, k) => glyph(ch).forEach((row, r) => [...row].forEach((bit, c) => {
      if (bit !== "1") return;
      for (let yy = 0; yy < sc; yy += 2) for (let xx = 0; xx < sc; xx += 2) pts.push({ x: x0 + (k * 6 + c) * sc + xx, y: y0 + r * sc + yy, c: P.amber, a: 1, s: 2 });
    })));
    return { pts, bottom: y0 + 7 * sc };
  })();

  // the M
  const mBig = mPixels(CX, CY - (V ? 14 : 8), V ? 100 : 92, 2).map((p) => ({ x: p.x, y: p.y, c: p.c, a: 1, s: 2 }));
  const mFinal = mPixels(CX, V ? 96 : 52, V ? 70 : 54, 2).map((p) => ({ x: p.x, y: p.y, c: p.c, a: 1, s: 2 }));
  const mForm = fill(mBig);
  const shatter: Form = {
    kind: "dyn",
    fn: (i, t) => {
      const p = (mForm as { pts: Pt[] }).pts[i];
      if (i >= mBig.length) return star(i, t);
      const vx = (hash(i, 8) - 0.5) * 140, vy = -40 - hash(i, 9) * 90;
      return { ...p, x: p.x + vx * t, y: p.y + vy * t + 260 * t * t, a: Math.max(0, 1 - t * 0.9) };
    },
  };

  // service icons, 6 logical px per icon pixel, filled with 2px particles
  const icons = SERVICES.map((s) => {
    const sc = V ? 7 : 6, pts: Pt[] = [], x0 = CX - 6 * sc, y0 = CY - (V ? 70 : 50);
    iconPixels(s.icon).forEach(({ x, y, c }) => {
      for (let yy = 0; yy < sc; yy += 2) for (let xx = 0; xx < sc; xx += 2) pts.push({ x: x0 + x * sc + xx, y: y0 + y * sc + yy, c, a: 1, s: 2 });
    });
    return fill(pts);
  });

  const vortex: Form = {
    kind: "dyn",
    fn: (i, t) => {
      const T = b(3.5) / FPS, p = Math.min(1, t / T);
      const r0 = 20 + hash(i, 10) * (V ? 110 : 140), r = r0 * (1 - Math.pow(p, 1.6) * 0.92);
      const ang = hash(i, 11) * Math.PI * 2 + t * (2 + (1 - r / 160) * 6);
      return { x: CX + Math.cos(ang) * r, y: CY + Math.sin(ang) * r * (V ? 1.25 : 0.75), c: BRAND[(i + Math.floor(t * 14)) % 4], a: 0.9, s: hash(i, 12) > 0.75 ? 2 : 1 };
    },
  };
  const dot: Form = { kind: "dyn", fn: (i) => ({ x: CX, y: CY, c: P.amber, a: i === 0 ? 1 : 0, s: 1 }) };

  const keys: Key[] = [
    { at: 0, form: explode(CX, CY), dur: 0, stagger: 0 },
    { at: b(1), form: stars, dur: b(1.5), stagger: b(0.6) },
    { at: b(4), form: fill(grid), dur: b(0.6), stagger: b(0.4) },
    { at: b(6), form: fill(bars), dur: b(0.6), stagger: b(0.3) },
    { at: b(8), form: fill(ring), dur: b(0.6), stagger: b(0.3) },
    { at: b(10), form: fill(digits.pts), dur: b(0.6), stagger: b(0.3) },
    { at: b(11.5), form: stars, dur: b(0.45), stagger: b(0.1) },
    { at: b(12), form: mForm, dur: b(0.7), stagger: b(0.3) },
    { at: b(15), form: shatter, dur: 2, stagger: 0 },
    ...icons.map((form, k) => ({ at: b(16 + k * 0.5), form, dur: b(0.3), stagger: b(0.12) })),
    { at: b(20), form: stars, dur: b(0.4), stagger: b(0.1) },
    { at: b(24), form: vortex, dur: b(0.5), stagger: b(0.2) },
    { at: b(27.5), form: dot, dur: 3, stagger: 0 },
    { at: b(28), form: explode(CX, CY), dur: 0, stagger: 0 },
    { at: b(28) + 9, form: fill(mFinal), dur: b(0.9), stagger: b(0.4) },
  ];
  return { CX, CY, keys, barLabels, gridBottom, digitsBottom: digits.bottom };
}

export const evalForm = (form: Form, i: number, t: number): Pt => (form.kind === "static" ? form.pts[i] : form.fn(i, t));
export function particle(keys: Key[], i: number, f: number): Pt {
  let k = 0;
  while (k + 1 < keys.length && keys[k + 1].at <= f) k++;
  const cur = keys[k], to = evalForm(cur.form, i, (f - cur.at) / FPS);
  if (k === 0 || cur.dur === 0) return to;
  const prev = keys[k - 1], from = evalForm(prev.form, i, (f - prev.at) / FPS);
  const e = outExpo(clamp01((f - cur.at - cur.stagger * (cur.order ? cur.order(to, i) : hash(i, 13))) / cur.dur));
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, c: mix(from.c, to.c, e), a: from.a + (to.a - from.a) * e, s: e < 0.5 ? from.s : to.s };
}

// ---------- drawing helpers ----------
export const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, sc: number, c: RGB, o: { align?: "center" | "left" | "right"; reveal?: number; cursor?: boolean; a?: number } = {}) {
  const { align = "center", reveal = s.length, cursor = false, a = 1 } = o;
  const w = textWidth(s, sc), x0 = Math.round(align === "center" ? x - w / 2 : align === "right" ? x - w : x);
  ctx.fillStyle = rgb(c, a);
  const n = Math.floor(reveal);
  [...s].slice(0, n).forEach((ch, k) => glyph(ch).forEach((row, r) => [...row].forEach((bit, cc) => {
    if (bit === "1") ctx.fillRect(x0 + (k * 6 + cc) * sc, Math.round(y) + r * sc, sc, sc);
  })));
  if (cursor && n <= s.length) ctx.fillRect(x0 + Math.min(n, s.length) * 6 * sc, Math.round(y), 5 * sc, 7 * sc);
}
export const lines = (ctx: CanvasRenderingContext2D, ls: string[], x: number, y: number, sc: number, c: RGB, o: Parameters<typeof text>[6] = {}) =>
  ls.forEach((l, k) => text(ctx, l, x, y + k * 9 * sc, sc, c, o));
export function glitch(ctx: CanvasRenderingContext2D, LW: number, LH: number, f: number, amount: number) {
  for (let k = 0; k < 5; k++) {
    const y = Math.floor(hash(f, k) * LH), h = 2 + Math.floor(hash(f, k + 9) * 10), dx = Math.round((hash(f, k + 19) - 0.5) * 30 * amount);
    const img = ctx.getImageData(0, y, LW, h); ctx.putImageData(img, dx, y);
  }
}

// ---------- the frame ----------
function draw(ctx: CanvasRenderingContext2D, f: number, LW: number, LH: number, V: boolean, W: ReturnType<typeof buildWorld>) {
  const { CX, CY } = W;
  const s16 = Math.floor(f / (BF / 4));
  const stutter = (f >= b(3) && f < b(4)) || (f >= b(27) && f < b(27.5));
  const inverted = stutter && s16 % 2 === 0;
  ctx.fillStyle = rgb(f >= b(27.5) && f < b(28) ? [0, 0, 0] : inverted ? P.ice : P.navy);
  ctx.fillRect(0, 0, LW, LH);

  // particles
  const shimmerX = f >= b(13) && f < b(14) ? -20 + ((f - b(13)) / b(1)) * (LW + 40) : -999;
  for (let i = 0; i < N; i++) {
    const p = particle(W.keys, i, f);
    if (p.a <= 0.01) continue;
    let c = p.c;
    if (Math.abs(p.x - shimmerX) < 5) c = mix(c, [255, 255, 255], 0.85);
    if (inverted) c = P.navy;
    ctx.fillStyle = rgb(c, p.a);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }

  const fg = inverted ? P.navy : P.ice, acc = inverted ? P.navy : P.amber;
  // ---- 1. hook: typing
  if (f < b(4)) {
    const r1 = (f - b(0.5)) / (b(0.09)), r2 = (f - b(2)) / b(0.1);
    const l1 = "EVERY SPECIALIST.", l2 = "ONE FIRM.";
    if (V) {
      text(ctx, "EVERY", CX, CY - 40, 2, fg, { reveal: Math.max(0, r1), cursor: r1 > 0 && r1 < 5 && s16 % 2 === 0 });
      text(ctx, "SPECIALIST.", CX, CY - 22, 2, fg, { reveal: Math.max(0, r1 - 6), cursor: r1 >= 6 && r1 < 17 && s16 % 2 === 0 });
      if (r2 > 0) text(ctx, l2, CX, CY + 6, 3, acc, { reveal: r2, cursor: r2 < l2.length });
    } else {
      if (r1 > 0) text(ctx, l1, CX, CY - 22, 2, fg, { reveal: r1, cursor: r1 < l1.length && s16 % 2 === 0 });
      if (r2 > 0) text(ctx, l2, CX, CY + 2, 3, acc, { reveal: r2, cursor: r2 < l2.length });
    }
    if (f < b(0.5)) text(ctx, "> MANYWRIGHT.COM", 8, LH - (V ? 50 : 16), 1, P.muted, { align: "left", reveal: f / 1.2, cursor: true });
  }
  // ---- 2. formations captions
  if (f >= b(4) && f < b(12)) {
    if (f < b(6)) text(ctx, "199 SPECIALIST ROLES", CX, W.gridBottom + (V ? 6 : 4), 1, P.ice, { reveal: (f - b(4.3)) / 1.5, cursor: true });
    else if (f < b(8)) {
      text(ctx, "13 DISCIPLINES", CX, V ? 22 : 12, V ? 1 : 2, P.ice, { reveal: (f - b(6.2)) / 1.5 });
      W.barLabels.forEach((l) => text(ctx, l.s, l.x, l.y, 1, P.muted, { align: V ? "left" : "center", a: Math.min(1, (f - b(6.3)) / 10) }));
    } else if (f < b(10)) lines(ctx, ["ONE", "BENCH"], CX, CY - 16, 2, P.ice, { reveal: (f - b(8.3)) / 2 });
    else if (f < b(11.5)) text(ctx, "SPECIALIST ROLES", CX, W.digitsBottom + 8, 1, P.ice, { reveal: (f - b(10.4)) / 1.2 });
  }
  // ---- 3. M caption
  if (f >= b(14) && f < b(15)) {
    if (V) lines(ctx, ["EVERY SPECIALIST.", "ONE FIRM."], CX, CY + 50, 1, P.ice, { reveal: (f - b(14)) / 0.6 });
    else text(ctx, "EVERY SPECIALIST. ONE FIRM.", CX, CY + 48, 1, P.ice, { reveal: (f - b(14)) / 0.6 });
  }
  // ---- 4. services
  if (f >= b(16) && f < b(20)) {
    const k = Math.min(7, Math.floor((f - b(16)) / (BF / 2))), lf = f - b(16 + k * 0.5), s = SERVICES[k];
    const ty = V ? CY + 26 : CY + 34;
    if (V && s.name.includes(" ")) lines(ctx, s.name.split(" "), CX, ty, 2, P.ice, { reveal: lf / 0.7 });
    else text(ctx, s.name, CX, ty, 2, P.ice, { reveal: lf / 0.7 });
    text(ctx, s.price, CX, ty + (V && s.name.includes(" ") ? 40 : 20), 1, P.amber, { a: Math.min(1, lf / 6) });
    text(ctx, `0${k + 1}/08`, 8, V ? 40 : 8, 1, P.muted, { align: "left" });
  }
  // ---- 5. platformer: the wright jumps brief → propose → make → deliver
  if (f >= b(20) && f < b(24)) {
    const names = ["BRIEF", "PROPOSE", "MAKE", "DELIVER"];
    const plat = V ? [[46, 262], [132, 214], [46, 166], [132, 118]] : [[52, 146], [124, 130], [196, 114], [268, 98]];
    const start = V ? [20, 300] : [12, 166];
    const lt = (f - b(20)) / BF; // beats into the bar
    const jumpIdx = Math.min(3, Math.floor(lt)), jt = clamp01((lt - jumpIdx) / 0.42);
    // ground
    ctx.fillStyle = rgb(P.dim); ctx.fillRect(0, V ? 310 : 176, LW, 4);
    plat.forEach(([x, y], k) => {
      const landed = lt >= k + 0.42;
      ctx.fillStyle = rgb(landed ? P.amber : P.muted); ctx.fillRect(x - 20, y, 40, 4);
      ctx.fillStyle = rgb(landed ? [190, 120, 20] : P.dim); for (let bx = x - 20; bx < x + 20; bx += 5) ctx.fillRect(bx, y + 2, 1, 2);
      text(ctx, names[k], x, y + 7, 1, landed ? P.amber : P.muted);
      if (landed && lt < k + 1.1) { // dust puff
        const pt = (lt - k - 0.42) * 6;
        for (let q = 0; q < 8; q++) { ctx.fillStyle = rgb(P.ice, Math.max(0, 1 - pt)); ctx.fillRect(Math.round(x + (q - 3.5) * 3 * (1 + pt)), Math.round(y - 2 - pt * 3 * hash(q, 3)), 1, 1); }
      }
    });
    // flag with the M on the last platform
    const [fx, fy] = plat[3];
    ctx.fillStyle = rgb(P.ice); ctx.fillRect(fx + 14, fy - 22, 1, 22);
    const flagUp = lt >= 3.42 ? Math.min(1, (lt - 3.42) * 4) : 0;
    mPixels(fx + 22, fy - 20 + (1 - flagUp) * 10, 9, 1).forEach((p) => { ctx.fillStyle = rgb(p.c, 0.4 + flagUp * 0.6); ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); });
    // the wright
    const from = jumpIdx === 0 ? start : [plat[jumpIdx - 1][0], plat[jumpIdx - 1][1]];
    const to = plat[jumpIdx];
    const x = from[0] + (to[0] - from[0]) * jt, yBase = from[1] + (to[1] - from[1]) * jt;
    const ks = 2; // sprite scale
    const y = yBase - Math.sin(Math.PI * jt) * 30 - 10 * ks;
    const frame = jt > 0 && jt < 1 ? "jump" : Math.floor(f / 8) % 2 ? "a" : "b";
    sprite(frame as "a").forEach((p) => { ctx.fillStyle = rgb(p.c); ctx.fillRect(Math.round(x - 4 * ks + p.x * ks), Math.round(y + p.y * ks), ks, ks); });
    if (lt >= 3.42) {
      const rt = lt - 3.42;
      text(ctx, "+1 PROJECT DELIVERED", V ? CX : fx - 40, fy - 40 - rt * 14, 1, P.amber, { a: Math.max(0, 1 - rt * 1.4) });
    }
    text(ctx, "4 STEPS. 1 WAY OF WORKING.", CX, V ? 40 : 12, 1, P.ice, { reveal: (f - b(20.1)) / 1 });
  }
  // ---- 6. build
  if (f >= b(24) && f < b(27.5)) {
    const word = f < b(25) ? "ONE BRIEF." : f < b(26) ? "ONE LEAD." : "ONE FIRM.";
    const pumps = f >= b(27) ? 1 + (s16 % 2) : 0;
    if (V) lines(ctx, word.split(" "), CX, CY - 22, 3 + pumps, inverted ? P.navy : P.ice);
    else text(ctx, word, CX, CY - 10 - pumps * 4, 3 + pumps, inverted ? P.navy : P.ice);
  }
  // ---- 7. land
  if (f >= b(28)) {
    const lf = f - b(28);
    const ty = V ? 150 : 92, wsc = V ? 2 : 3;
    const tag = Math.min(1, Math.max(0, (lf - b(0.9)) / 10));
    if (lf > b(0.4)) {
      const reveal = (lf - b(0.4)) / 1.3;
      const w = textWidth("MANYWRIGHT", wsc), x0 = CX - w / 2;
      text(ctx, "MANY", x0, ty, wsc, P.ice, { align: "left", reveal });
      text(ctx, "WRIGHT", x0 + 4 * 6 * wsc, ty, wsc, P.soft, { align: "left", reveal: reveal - 4 });
    }
    if (V) lines(ctx, ["EVERY SPECIALIST.", "ONE FIRM."], CX, ty + 26, 1, P.ice, { a: tag });
    else text(ctx, "EVERY SPECIALIST. ONE FIRM.", CX, ty + 30, 1, P.ice, { a: tag });
    if (lf > b(1.4)) text(ctx, "MANYWRIGHT.COM", CX, ty + (V ? 58 : 46), 2, P.amber, { reveal: (lf - b(1.4)) / 1.2, cursor: Math.floor(lf / 18) % 2 === 0 });
    if (lf > b(2.2)) {
      const a = Math.min(1, (lf - b(2.2)) / 12);
      lines(ctx, V ? ["WEBSITES · LOCAL SEARCH", "SOCIAL · BOOKS", "INBOX · SECURITY"] : ["WEBSITES · LOCAL SEARCH · SOCIAL", "BOOKS · INBOX · SECURITY"], CX, ty + (V ? 90 : 66), 1, P.muted, { a });
    }
  }
  // flashes on the two big hits
  const fl = f < 4 ? 1 - f / 4 : f >= b(28) && f < b(28) + 5 ? 1 - (f - b(28)) / 5 : 0;
  if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, LW, LH); }
  if (stutter) glitch(ctx, LW, LH, f, f >= b(27) ? 1.6 : 1);
  if (f >= b(15) && f < b(15) + 8) glitch(ctx, LW, LH, f, 0.6);
}

export const PixelReel: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const V = height > width, LW = V ? 180 : 320, LH = V ? 320 : 180, S = width / LW;
  const world = useMemo(() => buildWorld(LW, LH, V), [LW, LH, V]);
  const main = useRef<HTMLCanvasElement>(null), glow = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = main.current!.getContext("2d", { willReadFrequently: true })!;
    draw(ctx, f, LW, LH, V, world);
    const g = glow.current!.getContext("2d")!;
    g.clearRect(0, 0, LW, LH); g.drawImage(main.current!, 0, 0);
  }, [f, world, LW, LH, V]);
  // pixel-snapped screen shake on the hits
  const hits: [number, number, number][] = [[0, 22, 4], [b(3), b(1), 1.5], [b(15), 10, 2], [b(27), b(0.5), 3], [b(28), 26, 5]];
  let sx = 0, sy = 0;
  hits.forEach(([at, dur, amp]) => { if (f >= at && f < at + dur) { const d = 1 - (f - at) / dur; sx += Math.round((hash(f, 21) - 0.5) * 2 * amp * d); sy += Math.round((hash(f, 22) - 0.5) * 2 * amp * d); } });
  const cv: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated" };
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translate(${sx * S}px, ${sy * S}px)` }}>
        <canvas ref={main} width={LW} height={LH} style={cv} />
        <canvas ref={glow} width={LW} height={LH} style={{ ...cv, filter: `blur(${S * 1.6}px) brightness(1.3)`, mixBlendMode: "screen", opacity: 0.55 }} />
      </div>
      {/* CRT: a dark line on every pixel row, plus vignette */}
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(to bottom, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) ${S * 0.34}px, transparent ${S * 0.34}px, transparent ${S}px)`, pointerEvents: "none" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" }} />
      <Audio src={staticFile("pixel.wav")} />
    </AbsoluteFill>
  );
};
