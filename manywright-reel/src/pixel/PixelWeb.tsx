import React, { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { b, BF, FPS } from "../lib";
import { BRAND, iconPixels, mPixels, P, RGB, sprite, textWidth } from "./art";
import { clamp01, Form, glitch, hash, Key, lines, mix, N, particle, Pt, rgb, text } from "./PixelReel";

/* Manywright · Website development, as a pixel-art particle piece.
   Content is taken from manywright.com/services/website-development/ only. */

const FEATURES: { icon: string; name: string; v: string[]; sub: string }[] = [
  { icon: "phone", name: "PHONES FIRST", v: ["PHONES", "FIRST"], sub: "LAID OUT FOR SMALL SCREENS" },
  { icon: "doc", name: "COPY DRAFTED FOR YOU", v: ["COPY DRAFTED", "FOR YOU"], sub: "FROM A SHORT QUESTIONNAIRE" },
  { icon: "call", name: "FORMS + CLICK-TO-CALL", v: ["FORMS +", "CLICK-TO-CALL"], sub: "SO ENQUIRIES REACH YOU" },
  { icon: "pin", name: "LOCAL SEARCH BASICS", v: ["LOCAL SEARCH", "BASICS"], sub: "SEO · ANALYTICS · GOOGLE PROFILE" },
  { icon: "bolt", name: "SPEED + ACCESSIBILITY", v: ["SPEED +", "ACCESSIBILITY"], sub: "WCAG 2.2 AA BASICS CHECKED" },
  { icon: "key", name: "YOURS TO EDIT", v: ["YOURS", "TO EDIT"], sub: "EDITING GUIDE + EVERY LOGIN" },
];
const PAGES = ["HOME", "SERVICES", "ABOUT", "CONTACT", "LOCATION", "REVIEWS"];
const CHECKS = ["MOBILE LOAD TIME", "WCAG 2.2 AA BASICS", "FORMS + CALL BUTTON", "LOCAL SEO, 1 LOCATION"];
const ROLES = ["CMS DEVELOPER", "UI DESIGNER", "FRONTEND DEVELOPER", "SEO SPECIALIST", "ACCESSIBILITY AUDITOR", "PERFORMANCE BENCHMARKER", "RELEASE READINESS REVIEWER", "MAINTENANCE ENGINEER"];
const CURSOR = ["w......", "ww.....", "www....", "wwww...", "wwwww..", "wwwwww.", "wwwwwww", "www....", "w.ww...", "...ww.."];

function buildWorld(LW: number, LH: number, V: boolean) {
  const CX = LW / 2, CY = LH / 2;
  const star = (i: number, t: number): Pt => ({
    x: hash(i, 1) * LW, y: hash(i, 2) * LH, c: hash(i, 3) > 0.8 ? P.ice : P.muted,
    a: (0.12 + 0.4 * hash(i, 4)) * (0.6 + 0.4 * Math.sin(t * 3 + i)), s: 1,
  });
  const fill = (pts: Pt[]): Form => {
    const take = pts.length > N ? pts.filter((_, k) => k % Math.ceil(pts.length / N) === 0) : pts;
    return { kind: "static", pts: Array.from({ length: N }, (_, i) => (i < take.length ? take[i] : star(i, 0))) };
  };
  const stars: Form = { kind: "dyn", fn: (i, t) => star(i, t) };
  const explode = (cx: number, cy: number): Form => ({
    kind: "dyn",
    fn: (i, t) => {
      const ang = hash(i, 5) * Math.PI * 2, sp = 30 + hash(i, 6) * 210, d = sp * (1 - Math.exp(-t * 3.5));
      return { x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d * (V ? 1.2 : 0.8), c: BRAND[i % 4], a: 1, s: hash(i, 7) > 0.7 ? 2 : 1 };
    },
  });
  const rect = (pts: Pt[], x: number, y: number, w: number, h: number, c: RGB, step = 2, s = 2) => {
    for (let yy = 0; yy < h; yy += step) for (let xx = 0; xx < w; xx += step) pts.push({ x: x + xx, y: y + yy, c, a: 1, s });
  };
  const outline = (pts: Pt[], x: number, y: number, w: number, h: number, c: RGB) => {
    for (let xx = 0; xx < w; xx++) { pts.push({ x: x + xx, y, c, a: 1, s: 1 }); pts.push({ x: x + xx, y: y + h - 1, c, a: 1, s: 1 }); }
    for (let yy = 1; yy < h - 1; yy++) { pts.push({ x, y: y + yy, c, a: 1, s: 1 }); pts.push({ x: x + w - 1, y: y + yy, c, a: 1, s: 1 }); }
  };

  // ---- the phone and the site inside it
  const ph = V ? { cx: CX, cy: 132, w: 80, h: 140 } : { cx: 96, cy: CY + 4, w: 64, h: 112 };
  const phone = (() => {
    const pts: Pt[] = [], x0 = ph.cx - ph.w / 2, y0 = ph.cy - ph.h / 2;
    outline(pts, x0, y0, ph.w, ph.h, P.muted); outline(pts, x0 + 1, y0 + 1, ph.w - 2, ph.h - 2, P.muted);
    rect(pts, ph.cx - 6, y0 + 3, 12, 2, P.dim, 1, 1); // speaker
    const sx = x0 + 4, sy = y0 + 8, sw = ph.w - 8, sh = ph.h - 16, r = (fr: number) => Math.round(sy + fr * sh);
    const ui = {
      nav: [sx, r(0), sw, Math.round(sh * 0.07)], hero: [sx, r(0.1), sw, Math.round(sh * 0.2)],
      h1: [sx + 2, r(0.34), Math.round(sw * 0.8), 2], h2: [sx + 2, r(0.38), Math.round(sw * 0.55), 2],
      call: [sx + 2, r(0.45), sw - 4, Math.round(sh * 0.11)], f1: [sx + 2, r(0.61), sw - 4, Math.round(sh * 0.07)],
      f2: [sx + 2, r(0.71), sw - 4, Math.round(sh * 0.07)], quote: [sx + 2, r(0.84), sw - 4, Math.round(sh * 0.1)],
    };
    rect(pts, ui.nav[0], ui.nav[1], ui.nav[2], ui.nav[3], P.cobalt);
    rect(pts, ui.hero[0], ui.hero[1], ui.hero[2], ui.hero[3], P.soft);
    rect(pts, ui.h1[0], ui.h1[1], ui.h1[2], ui.h1[3], P.ice, 1, 1);
    rect(pts, ui.h2[0], ui.h2[1], ui.h2[2], ui.h2[3], P.muted, 1, 1);
    rect(pts, ui.call[0], ui.call[1], ui.call[2], ui.call[3], P.amber);
    outline(pts, ui.f1[0], ui.f1[1], ui.f1[2], ui.f1[3], P.muted);
    outline(pts, ui.f2[0], ui.f2[1], ui.f2[2], ui.f2[3], P.muted);
    rect(pts, ui.quote[0], ui.quote[1], ui.quote[2], ui.quote[3], P.coral);
    rect(pts, ph.cx - 8, y0 + ph.h - 5, 16, 2, P.dim, 1, 1); // home bar
    return { pts, ui, top: y0 };
  })();

  // ---- feature icons
  const icons = FEATURES.map((ft) => {
    const sc = V ? 7 : 6, pts: Pt[] = [], x0 = CX - 6 * sc, y0 = V ? CY - 90 : CY - 58;
    iconPixels(ft.icon).forEach(({ x, y, c }) => rect(pts, x0 + x * sc, y0 + y * sc, sc, sc, c));
    return fill(pts);
  });
  // ---- six page tiles
  const tilePos = PAGES.map((_, k) => (V ? [CX + (k % 2 ? 36 : -36), 92 + Math.floor(k / 2) * 66] : [CX + (k - 2.5) * 50, CY - 8]));
  const pages = (() => {
    const pts: Pt[] = [];
    tilePos.forEach(([x, y], k) => {
      outline(pts, x - 11, y - 15, 22, 30, P.ice);
      rect(pts, x - 8, y - 12, 16, 5, k === 0 ? P.amber : P.cobalt);
      for (let l = 0; l < 4; l++) rect(pts, x - 8, y - 4 + l * 4, l % 2 ? 10 : 14, 1, P.muted, 1, 1);
    });
    return pts;
  })();
  // ---- speed gauge (semicircle)
  const gauge = V ? { cx: CX, cy: 128, r: 46 } : { cx: 82, cy: CY + 22, r: 46 };
  const arc = (() => {
    const pts: Pt[] = [];
    for (let k = 0; k <= 60; k++) {
      const a = Math.PI + (k / 60) * Math.PI, c = k < 20 ? P.coral : k < 40 ? P.amber : P.ice;
      for (let w = 0; w < 3; w++) pts.push({ x: gauge.cx + Math.cos(a) * (gauge.r - w * 2) - 1, y: gauge.cy + Math.sin(a) * (gauge.r - w * 2) - 1, c, a: 1, s: 2 });
    }
    return pts;
  })();
  // ---- bench under the eight role avatars
  const avatarPos = ROLES.map((_, k) => (V ? [CX + ((k % 4) - 1.5) * 40, CY - 76 + Math.floor(k / 4) * 54] : [CX + (k - 3.5) * 34, CY - 30]));
  const bench = (() => {
    const pts: Pt[] = [];
    const rows = V ? [CY - 54, CY] : [CY - 6];
    rows.forEach((y) => rect(pts, V ? CX - 80 : CX - 140, y, V ? 160 : 280, 2, P.dim));
    return pts;
  })();
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
  const mFinal = mPixels(CX, V ? 74 : 32, V ? 58 : 40, 2).map((p) => ({ x: p.x, y: p.y, c: p.c, a: 1, s: 2 }));

  const byY = (top: number, h: number) => (p: Pt) => clamp01((p.y - top) / h);
  const keys: Key[] = [
    { at: 0, form: explode(CX, CY), dur: 0, stagger: 0 },
    { at: b(1), form: stars, dur: b(1.5), stagger: b(0.6) },
    { at: b(4), form: fill(phone.pts), dur: b(0.5), stagger: b(1.6), order: byY(phone.top, ph.h) }, // the site loads top to bottom
    ...icons.map((form, k) => ({ at: b(8 + k * 0.5), form, dur: b(0.3), stagger: b(0.12) })),
    { at: b(11), form: fill(pages), dur: b(0.25), stagger: b(0.7), order: (p: Pt) => clamp01(V ? (p.y - 70) / 160 : (p.x - 20) / 280) },
    { at: b(12), form: fill(arc), dur: b(0.5), stagger: b(0.3) },
    { at: b(16), form: stars, dur: b(0.4), stagger: b(0.1) },
    { at: b(20), form: fill(bench), dur: b(0.4), stagger: b(0.2) },
    { at: b(24), form: vortex, dur: b(0.5), stagger: b(0.2) },
    { at: b(27.5), form: dot, dur: 3, stagger: 0 },
    { at: b(28), form: explode(CX, CY), dur: 0, stagger: 0 },
    { at: b(28) + 9, form: fill(mFinal), dur: b(0.9), stagger: b(0.4) },
  ];
  return { CX, CY, keys, phone, ph, tilePos, gauge, avatarPos };
}

const ring = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: RGB, a: number) => {
  ctx.fillStyle = rgb(c, a);
  for (let k = 0; k < 48; k++) { const t = (k / 48) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 1, 1); }
};

function draw(ctx: CanvasRenderingContext2D, f: number, LW: number, LH: number, V: boolean, W: ReturnType<typeof buildWorld>) {
  const { CX, CY } = W;
  const s16 = Math.floor(f / (BF / 4));
  const stutter = (f >= b(3) && f < b(4)) || (f >= b(27) && f < b(27.5));
  const inverted = stutter && s16 % 2 === 0;
  ctx.fillStyle = rgb(f >= b(27.5) && f < b(28) ? [0, 0, 0] : inverted ? P.ice : P.navy);
  ctx.fillRect(0, 0, LW, LH);
  for (let i = 0; i < N; i++) {
    const p = particle(W.keys, i, f);
    if (p.a <= 0.01) continue;
    ctx.fillStyle = rgb(inverted ? P.navy : p.c, p.a);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }
  const fg = inverted ? P.navy : P.ice, acc = inverted ? P.navy : P.amber;

  // ---- 1. hook
  if (f < b(4)) {
    const r1 = (f - b(0.5)) / b(0.09), r2 = (f - b(2)) / b(0.06);
    const blink = s16 % 2 === 0;
    if (r1 > 0) text(ctx, "YOUR SITE.", CX, CY - (V ? 34 : 24), V ? 3 : 3, fg, { reveal: r1, cursor: r1 < 10 && blink });
    if (r2 > 0) {
      if (V) { text(ctx, "ON EVERY", CX, CY + 2, 2, acc, { reveal: r2 }); text(ctx, "PHONE.", CX, CY + 22, 3, acc, { reveal: r2 - 9, cursor: r2 < 15 }); }
      else text(ctx, "ON EVERY PHONE.", CX, CY + 4, 2, acc, { reveal: r2, cursor: r2 < 15 });
    }
    if (f < b(0.5)) text(ctx, "> MANYWRIGHT.COM/WEBSITES", 8, LH - (V ? 50 : 16), 1, P.muted, { align: "left", reveal: f / 0.6, cursor: true });
  }
  // ---- 2. phone: the site loads, then a visitor taps to call
  if (f >= b(4) && f < b(8)) {
    const { ui } = W.phone;
    const loaded = (fr: number) => f >= b(4) + fr * b(1.6) + b(0.4);
    if (loaded(0.5)) text(ctx, "CALL NOW", ui.call[0] + ui.call[2] / 2, ui.call[1] + Math.round(ui.call[3] / 2) - 3, 1, P.navy);
    if (loaded(0.9)) text(ctx, "GET A QUOTE", ui.quote[0] + ui.quote[2] / 2, ui.quote[1] + Math.round(ui.quote[3] / 2) - 3, 1, P.navy);
    // captions
    const tx = V ? CX : 220, ty = V ? 222 : 44;
    lines(ctx, ["DESIGNED FOR", "PHONES FIRST."], tx, ty, V ? 1 : 2, P.ice, { reveal: (f - b(4.3)) / 1.2 });
    if (f >= b(6)) text(ctx, "TAP TO CALL.", tx, ty + (V ? 26 : 46), V ? 1 : 2, P.amber, { reveal: (f - b(6)) / 1.2 });
    if (f >= b(6.5)) text(ctx, "QUOTE FORMS.", tx, ty + (V ? 38 : 66), V ? 1 : 2, P.coral, { reveal: (f - b(6.5)) / 1.2 });
    // cursor glides in and taps CALL NOW at beat 6
    const bx = ui.call[0] + ui.call[2] * 0.62, by = ui.call[1] + ui.call[3] * 0.6;
    if (f >= b(5.4)) {
      const m = clamp01((f - b(5.4)) / (b(6) - b(5.4))), e = 1 - Math.pow(1 - m, 3);
      const cx = bx + (1 - e) * 70, cy = by + (1 - e) * 40, press = f >= b(6) && f < b(6) + 5 ? 1 : 0;
      ctx.fillStyle = rgb(P.ice);
      CURSOR.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "w") ctx.fillRect(Math.round(cx + x), Math.round(cy + y + press), 1, 1); }));
      if (f >= b(6)) {
        const rt = (f - b(6)) / b(1);
        [0, 0.25, 0.5].forEach((d) => { const q = rt - d; if (q > 0 && q < 0.6) ring(ctx, bx, by, 4 + q * 40, P.amber, 1 - q / 0.6); });
        if (rt < 1) text(ctx, "RING!", W.ph.cx + (V ? 0 : 0) + Math.round(Math.sin(f * 1.7) * 2), W.phone.top - 12, 1, P.amber);
      }
    }
    if (f >= b(7)) {
      const rt = (f - b(7)) / b(1);
      text(ctx, "+1 ENQUIRY", W.ph.cx, W.phone.top - 14 - rt * 18, V ? 1 : 2, P.amber, { a: Math.max(0, 1 - rt * 1.2) });
    }
  }
  // ---- 3. what you get, then six pages
  if (f >= b(8) && f < b(11)) {
    const k = Math.min(5, Math.floor((f - b(8)) / (BF / 2))), lf = f - b(8 + k * 0.5), ft = FEATURES[k];
    const ty = V ? CY + 2 : CY + 26;
    if (V) lines(ctx, ft.v, CX, ty, 2, P.ice, { reveal: lf / 0.6 });
    else text(ctx, ft.name, CX, ty, 2, P.ice, { reveal: lf / 0.6 });
    text(ctx, ft.sub, CX, ty + (V ? 40 : 20), 1, P.amber, { a: Math.min(1, lf / 6) });
    text(ctx, `0${k + 1}/06  WHAT YOU GET`, 8, V ? 40 : 8, 1, P.muted, { align: "left" });
  }
  if (f >= b(11) && f < b(12)) {
    text(ctx, "UP TO 6 PAGES", CX, V ? 46 : 20, 2, P.ice, { reveal: (f - b(11)) / 0.8 });
    W.tilePos.forEach(([x, y], k) => { if (f >= b(11) + k * (b(1) / 6) + 4) text(ctx, PAGES[k], x, y + 20, 1, k === 0 ? P.amber : P.muted); });
  }
  // ---- 4. checked before it goes live
  if (f >= b(12) && f < b(16)) {
    const { cx, cy, r } = W.gauge;
    text(ctx, "CHECKED BEFORE IT GOES LIVE", CX, V ? 40 : 12, 1, P.ice, { reveal: (f - b(12)) / 0.8 });
    const sweep = clamp01((f - b(12.2)) / b(1.3)), ov = Math.sin(sweep * Math.PI) * 0.15;
    const ang = Math.PI + Math.min(0.88, sweep * 0.8 + ov) * Math.PI;
    for (let d = 0; d < r - 8; d++) { ctx.fillStyle = rgb(P.ice); ctx.fillRect(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), 2, 2); }
    ctx.fillStyle = rgb(P.amber); ctx.fillRect(cx - 3, cy - 3, 6, 6);
    text(ctx, "MOBILE SPEED", cx, cy + 10, 1, P.muted);
    const lx = V ? 22 : 170, ly = V ? 196 : 52;
    CHECKS.forEach((c, k) => {
      const at = b(12.5 + k * 0.5);
      if (f < at) return;
      const pop = Math.max(0, 1 - (f - at) / 6);
      text(ctx, "✓", lx, ly + k * 16 - Math.round(pop * 3), 1, P.amber, { align: "left" });
      text(ctx, c, lx + 10, ly + k * 16, 1, P.ice, { align: "left", reveal: (f - at) / 0.8 });
    });
    if (f >= b(15)) {
      const st = f - b(15), sc = 2, rows = V ? ["READY TO", "GO LIVE"] : ["READY TO GO LIVE"];
      const w = Math.max(...rows.map((r) => textWidth(r, sc)));
      const sy = (V ? 262 : CY + 54) - (st < 4 ? 3 : 0);
      ctx.fillStyle = rgb(P.amber);
      const bw = w + 12, bh = rows.length * 9 * sc - 2 * sc + 10, bx0 = Math.round(CX - bw / 2), by0 = Math.round(sy - 5);
      ctx.fillRect(bx0, by0, bw, 2); ctx.fillRect(bx0, by0 + bh - 2, bw, 2); ctx.fillRect(bx0, by0, 2, bh); ctx.fillRect(bx0 + bw - 2, by0, 2, bh);
      lines(ctx, rows, CX, sy, sc, P.amber);
    }
  }
  // ---- 5. the wright jumps brief → propose → make → deliver
  if (f >= b(16) && f < b(20)) {
    const names = ["BRIEF", "PROPOSE", "MAKE", "DELIVER"];
    const plat = V ? [[46, 262], [132, 214], [46, 166], [132, 118]] : [[52, 146], [124, 130], [196, 114], [268, 98]];
    const start = V ? [20, 300] : [12, 166];
    const lt = (f - b(16)) / BF, jumpIdx = Math.min(3, Math.floor(lt)), jt = clamp01((lt - jumpIdx) / 0.42);
    ctx.fillStyle = rgb(P.dim); ctx.fillRect(0, V ? 310 : 176, LW, 4);
    plat.forEach(([x, y], k) => {
      const landed = lt >= k + 0.42;
      ctx.fillStyle = rgb(landed ? P.amber : P.muted); ctx.fillRect(x - 20, y, 40, 4);
      text(ctx, names[k], x, y + 7, 1, landed ? P.amber : P.muted);
      if (landed && lt < k + 1.1) {
        const pt = (lt - k - 0.42) * 6;
        for (let q = 0; q < 8; q++) { ctx.fillStyle = rgb(P.ice, Math.max(0, 1 - pt)); ctx.fillRect(Math.round(x + (q - 3.5) * 3 * (1 + pt)), Math.round(y - 2 - pt * 3 * hash(q, 3)), 1, 1); }
      }
    });
    const [fx, fy] = plat[3];
    ctx.fillStyle = rgb(P.ice); ctx.fillRect(fx + 14, fy - 22, 1, 22);
    const up = lt >= 3.42 ? Math.min(1, (lt - 3.42) * 4) : 0;
    mPixels(fx + 22, fy - 20 + (1 - up) * 10, 9, 1).forEach((p) => { ctx.fillStyle = rgb(p.c, 0.4 + up * 0.6); ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); });
    const from = jumpIdx === 0 ? start : plat[jumpIdx - 1], to = plat[jumpIdx], ks = 2;
    const x = from[0] + (to[0] - from[0]) * jt, y = from[1] + (to[1] - from[1]) * jt - Math.sin(Math.PI * jt) * 30 - 10 * ks;
    const frame = jt > 0 && jt < 1 ? "jump" : Math.floor(f / 8) % 2 ? "a" : "b";
    sprite(frame as "a").forEach((p) => { ctx.fillStyle = rgb(p.c); ctx.fillRect(Math.round(x - 4 * ks + p.x * ks), Math.round(y + p.y * ks), ks, ks); });
    // days counter: content in → live in 15 business days
    const day = 1 + Math.floor(14 * clamp01((f - b(16)) / b(3.45)));
    text(ctx, `DAY ${String(day).padStart(2, "0")}/15`, LW - 8, V ? 64 : 26, 1, P.amber, { align: "right" });
    if (V) lines(ctx, ["15 BUSINESS DAYS AFTER", "YOUR CONTENT ARRIVES"], CX, 36, 1, P.ice);
    else text(ctx, "15 BUSINESS DAYS AFTER YOUR CONTENT ARRIVES", CX, 10, 1, P.ice);
    if (lt >= 3.42) { const rt = lt - 3.42; text(ctx, "SITE LIVE!", V ? CX : fx - 30, fy - 40 - rt * 14, V ? 1 : 2, P.amber, { a: Math.max(0, 1 - rt * 1.4) }); }
  }
  // ---- 6. eight specialist roles
  if (f >= b(20) && f < b(24)) {
    text(ctx, "8 SPECIALIST ROLES. 1 LEAD.", CX, V ? 40 : 14, 1, P.ice, { reveal: (f - b(20)) / 0.8 });
    const cur = Math.min(7, Math.floor((f - b(20)) / (BF / 2)));
    W.avatarPos.forEach(([ax, ay], k) => {
      const at = b(20 + k * 0.5), lit = f >= at, bounce = lit ? Math.max(0, 1 - (f - at) / 10) : 0;
      sprite("a").forEach((p) => {
        let c = p.c;
        if (!lit) c = c === P.amber ? P.dim : mix(c, P.navy, 0.6);
        ctx.fillStyle = rgb(c);
        ctx.fillRect(Math.round(ax - 8 + p.x * 2), Math.round(ay - 20 + p.y * 2 - bounce * 6), 2, 2);
      });
    });
    const name = ROLES[cur], lf = f - b(20 + cur * 0.5);
    if (V) lines(ctx, name.split(" "), CX, CY + 28, 2, P.amber, { reveal: lf / 0.6 });
    else text(ctx, name, CX, CY + 16, name.length > 22 ? 1 : 2, P.amber, { reveal: lf / 0.6 });
  }
  // ---- 7. build
  if (f >= b(24) && f < b(27.5)) {
    const word = f < b(25) ? "FIXED PRICE." : f < b(26) ? "WRITTEN SCOPE." : "CHECKED.";
    const pump = f >= b(27) && !V ? (s16 % 2) : 0;
    if (V) lines(ctx, word.split(" "), CX, CY - 22, 3 + pump, inverted ? P.navy : P.ice);
    else text(ctx, word, CX, CY - 10 - pump * 4, 3 + pump, inverted ? P.navy : P.ice);
  }
  // ---- 8. land
  if (f >= b(28)) {
    const lf = f - b(28), at = (beat: number) => Math.min(1, Math.max(0, (lf - b(beat)) / 10));
    if (V) {
      lines(ctx, ["WEBSITE", "STARTER"], CX, 116, 2, P.ice, { reveal: (lf - b(0.4)) / 1.3 });
      lines(ctx, ["FROM $3,500", "FIXED"], CX, 156, 2, P.amber, { a: at(0.8) });
      lines(ctx, ["UP TO 6 PAGES", "2 REVISION ROUNDS", "1 LOCATION"], CX, 194, 1, P.muted, { a: at(1.2) });
      if (lf > b(1.5)) text(ctx, "MANYWRIGHT.COM", CX, 230, 2, P.ice, { reveal: (lf - b(1.5)) / 1.2, cursor: Math.floor(lf / 18) % 2 === 0 });
      text(ctx, "OPTIONAL SITE CARE $249/MO", CX, 256, 1, P.muted, { a: at(2.2) });
    } else {
      text(ctx, "WEBSITE STARTER", CX, 58, 2, P.ice, { reveal: (lf - b(0.4)) / 1.3 });
      text(ctx, "FROM", CX, 77, 1, P.muted, { a: at(0.8) });
      text(ctx, "$3,500 FIXED", CX, 87, 3, P.amber, { a: at(0.8) });
      text(ctx, "UP TO 6 PAGES · 2 REVISION ROUNDS · 1 LOCATION", CX, 114, 1, P.muted, { a: at(1.2) });
      if (lf > b(1.5)) text(ctx, "MANYWRIGHT.COM", CX, 128, 2, P.ice, { reveal: (lf - b(1.5)) / 1.2, cursor: Math.floor(lf / 18) % 2 === 0 });
      text(ctx, "OPTIONAL SITE CARE $249/MO", CX, 152, 1, P.muted, { a: at(2.2) });
    }
  }
  const fl = f < 4 ? 1 - f / 4 : f >= b(28) && f < b(28) + 5 ? 1 - (f - b(28)) / 5 : 0;
  if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, LW, LH); }
  if (stutter) glitch(ctx, LW, LH, f, f >= b(27) ? 1.6 : 1);
  if (f >= b(15) && f < b(15) + 6) glitch(ctx, LW, LH, f, 0.5);
}

export const PixelWeb: React.FC = () => {
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
  const hits: [number, number, number][] = [[0, 22, 4], [b(3), b(1), 1.5], [b(6), 8, 1.5], [b(15), 12, 3], [b(27), b(0.5), 3], [b(28), 26, 5]];
  let sx = 0, sy = 0;
  hits.forEach(([at, dur, amp]) => { if (f >= at && f < at + dur) { const d = 1 - (f - at) / dur; sx += Math.round((hash(f, 21) - 0.5) * 2 * amp * d); sy += Math.round((hash(f, 22) - 0.5) * 2 * amp * d); } });
  const cv: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated" };
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translate(${sx * S}px, ${sy * S}px)` }}>
        <canvas ref={main} width={LW} height={LH} style={cv} />
        <canvas ref={glow} width={LW} height={LH} style={{ ...cv, filter: `blur(${S * 1.6}px) brightness(1.3)`, mixBlendMode: "screen", opacity: 0.55 }} />
      </div>
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(to bottom, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) ${S * 0.34}px, transparent ${S * 0.34}px, transparent ${S}px)`, pointerEvents: "none" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" }} />
      <Audio src={staticFile("pixel-web.wav")} />
    </AbsoluteFill>
  );
};
