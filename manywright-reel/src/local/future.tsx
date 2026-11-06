import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, random } from "remotion";
import { b, BF, ip, inOut, inExpo, MLogo, useL } from "../lib";
import { SERIF } from "./vintage";

// ---- Act II palette
export const F = { bg: "#050A14", panel: "rgba(14,30,52,0.62)", cyan: "#2EE6FF", amber: "#F5A524", ice: "#F4F6FA", cobalt: "#2E5BFF", coral: "#E8775E", dim: "#3A5068", muted: "#8EA7BB" };
export const WIDE = "'Archivo', 'Arial Narrow', sans-serif";
export const HUDF = "'JetBrains Mono', ui-monospace, monospace";
const wv = (w: number, g: number) => `'wdth' ${w}, 'wght' ${g}`;

export const Wide: React.FC<{ size: number; w?: number; g?: number; color?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ size, w = 125, g = 850, color = F.ice, style, children }) => (
  <div style={{ fontFamily: WIDE, fontVariationSettings: wv(w, g), fontSize: size, lineHeight: 0.92, color, letterSpacing: "-0.005em", ...style }}>{children}</div>
);
export const Hud: React.FC<{ size?: number; color?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ size = 20, color = F.cyan, style, children }) => (
  <div style={{ fontFamily: HUDF, fontSize: size, color, letterSpacing: "0.12em", textTransform: "uppercase", ...style }}>{children}</div>
);
// characters revealed with a scramble before they settle
const GLY = "▓▒░#/\\<>*+=01";
export const Scramble: React.FC<{ text: string; f: number; start: number; speed?: number }> = ({ text, f, start, speed = 1.4 }) => {
  const n = (f - start) / speed;
  return <>{[...text].map((ch, k) => (k < n - 3 ? ch : k < n ? (ch === " " ? " " : GLY[Math.floor(random(`g${k}${f}`) * GLY.length)]) : <span key={k} style={{ opacity: 0 }}>{ch}</span>))}</>;
};

/* ---------- a canvas that redraws every frame (with a blurred twin for glow) ---------- */
const GlowCanvas: React.FC<{ f: number; draw: (ctx: CanvasRenderingContext2D, f: number) => void; glow?: number }> = ({ f, draw, glow = 0.8 }) => {
  const { W, H } = useL();
  const a = useRef<HTMLCanvasElement>(null), g = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = a.current!.getContext("2d")!; ctx.clearRect(0, 0, W, H); draw(ctx, f);
    const gx = g.current!.getContext("2d")!; gx.clearRect(0, 0, W / 2, H / 2); gx.drawImage(a.current!, 0, 0, W / 2, H / 2);
  });
  return (
    <AbsoluteFill>
      <canvas ref={g} width={W / 2} height={H / 2} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: "blur(10px) brightness(1.6)", opacity: glow, mixBlendMode: "screen" }} />
      <canvas ref={a} width={W} height={H} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

/* ---------- 1. holographic city with "near me" pulses ---------- */
const BUILDINGS = Array.from({ length: 70 }, (_, k) => {
  const gx = Math.floor(random(`bx${k}`) * 14) - 7, gz = Math.floor(random(`bz${k}`) * 14) - 7;
  return { x: gx * 60 + 30, z: gz * 60 + 30, w: 34 + random(`bw${k}`) * 14, h: 30 + Math.pow(random(`bh${k}`), 2) * 190, pin: random(`bp${k}`) > 0.72 };
}).filter((bd) => Math.hypot(bd.x, bd.z) > 70);
export const City: React.FC<{ f: number }> = ({ f }) => {
  const { V: PT, W, H } = useL();
  const head1 = "SHOW UP WHEN PEOPLE NEARBY", head2 = "SEARCH FOR WHAT YOU DO.";
  const rise = ip(f, [b(1), b(2.2)], [0, 1]);
  const draw = (ctx: CanvasRenderingContext2D, fr: number) => {
    const ang = -0.6 + fr * 0.0042, elev = ip(fr, [0, b(8)], [0.32, 0.5], inOut), dist = ip(fr, [0, b(8)], [1150, 860], inOut);
    const cx = PT ? W / 2 : 1320, cy = PT ? H * 0.64 : 600, fov = PT ? 760 : 900;
    const P = (x: number, y: number, z: number) => {
      const xr = x * Math.cos(ang) - z * Math.sin(ang), zr = x * Math.sin(ang) + z * Math.cos(ang);
      const yr = y * Math.cos(elev) - zr * Math.sin(elev), zz = y * Math.sin(elev) + zr * Math.cos(elev) + dist;
      return [cx + (xr * fov) / zz, cy - (yr * fov) / zz, zz];
    };
    const line = (a: number[], c: number[], col: string, w = 1.5) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); };
    // floor grid
    for (let k = -8; k <= 8; k++) {
      line(P(k * 60, 0, -480), P(k * 60, 0, 480), "rgba(46,230,255,0.22)");
      line(P(-480, 0, k * 60), P(480, 0, k * 60), "rgba(46,230,255,0.22)");
    }
    // near-me pulses from the centre, one every 2 beats
    for (let p = 0; p < 4; p++) {
      const t = (fr - b(p * 2)) / b(2.5);
      if (t < 0 || t > 1) continue;
      const r = 20 + t * 520;
      ctx.strokeStyle = `rgba(245,165,36,${(1 - t) * 0.9})`; ctx.lineWidth = 3; ctx.beginPath();
      for (let s = 0; s <= 72; s++) { const q = P(Math.cos((s / 72) * Math.PI * 2) * r, 0, Math.sin((s / 72) * Math.PI * 2) * r); s ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
    }
    // buildings, far to near
    const order = [...BUILDINGS].sort((a, c) => P(c.x, 0, c.z)[2] - P(a.x, 0, a.z)[2]);
    order.forEach((bd, k) => {
      const grow = ip(fr, [k * 0.7, k * 0.7 + 20], [0, 1]), h = bd.h * grow, w = bd.w / 2;
      const c = [[-w, -w], [w, -w], [w, w], [-w, w]].map(([dx, dz]) => [P(bd.x + dx, 0, bd.z + dz), P(bd.x + dx, h, bd.z + dz)]);
      ctx.fillStyle = "rgba(10,30,60,0.55)"; ctx.beginPath(); c.forEach((e, i) => (i ? ctx.lineTo(e[1][0], e[1][1]) : ctx.moveTo(e[1][0], e[1][1]))); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 4; i++) { line(c[i][0], c[i][1], "rgba(46,230,255,0.55)", 1.2); line(c[i][1], c[(i + 1) % 4][1], "rgba(46,230,255,0.75)", 1.2); line(c[i][0], c[(i + 1) % 4][0], "rgba(46,230,255,0.3)", 1); }
      if (bd.pin && grow > 0.9) { const t = P(bd.x, h + 18, bd.z); ctx.fillStyle = "rgba(46,230,255,0.9)"; ctx.beginPath(); ctx.arc(t[0], t[1], 4, 0, Math.PI * 2); ctx.fill(); }
    });
    // your pin: a tall amber beam at the centre
    const top = P(0, 40 + 260 * rise, 0), base = P(0, 0, 0);
    const grad = ctx.createLinearGradient(base[0], base[1], top[0], top[1]); grad.addColorStop(0, "rgba(245,165,36,0.9)"); grad.addColorStop(1, "rgba(245,165,36,0)");
    ctx.strokeStyle = grad; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
    if (rise > 0) {
      const pp = P(0, 40 + 120 * rise, 0), s = 26 * rise;
      ctx.fillStyle = "#F5A524"; ctx.beginPath(); ctx.moveTo(pp[0], pp[1] + s * 1.4); ctx.bezierCurveTo(pp[0] - s * 1.3, pp[1], pp[0] - s, pp[1] - s * 1.3, pp[0], pp[1] - s * 1.3); ctx.bezierCurveTo(pp[0] + s, pp[1] - s * 1.3, pp[0] + s * 1.3, pp[1], pp[0], pp[1] + s * 1.4); ctx.fill();
      ctx.fillStyle = "#050A14"; ctx.beginPath(); ctx.arc(pp[0], pp[1] - s * 0.35, s * 0.42, 0, Math.PI * 2); ctx.fill();
    }
  };
  const tags = ["NEAR ME", "MONTHLY", "REPORT"];
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 62% 60%, #0c2240 0%, ${F.bg} 70%)` }}>
      <GlowCanvas f={f} draw={draw} />
      <AbsoluteFill style={{ background: PT ? "linear-gradient(180deg, rgba(5,10,20,0.92) 0%, rgba(5,10,20,0.65) 30%, rgba(5,10,20,0) 46%)" : "linear-gradient(90deg, rgba(5,10,20,0.9) 0%, rgba(5,10,20,0.7) 38%, rgba(5,10,20,0) 62%)" }} />
      <div style={{ position: "absolute", left: PT ? 70 : 96, top: PT ? 250 : 210, maxWidth: PT ? 940 : undefined }}>
        <Hud size={22} style={{ marginBottom: 26, lineHeight: 1.5 }}>Get found locally · Google profile, local search and reviews</Hud>
        {PT ? (
          <>
            <Wide size={74}><Scramble text="SHOW UP WHEN" f={f} start={4} /></Wide>
            <Wide size={74} style={{ marginTop: 6 }}><Scramble text="PEOPLE NEARBY" f={f} start={12} /></Wide>
            <Wide size={74} color={F.amber} style={{ marginTop: 6 }}><Scramble text="SEARCH FOR" f={f} start={b(1)} /></Wide>
            <Wide size={74} color={F.amber} style={{ marginTop: 6 }}><Scramble text="WHAT YOU DO." f={f} start={b(1) + 8} /></Wide>
          </>
        ) : (
          <>
            <Wide size={80}><Scramble text={head1} f={f} start={4} /></Wide>
            <Wide size={80} color={F.amber} style={{ marginTop: 8 }}><Scramble text={head2} f={f} start={b(1)} /></Wide>
          </>
        )}
      </div>
      <div style={{ position: "absolute", left: PT ? 70 : 96, bottom: PT ? 470 : 150, display: "flex", gap: 18 }}>
        {tags.map((t, k) => {
          const on = ip(f, [b(4 + k * 0.6), b(4 + k * 0.6) + 10], [0, 1]);
          return <div key={t} style={{ opacity: on, transform: `translateY(${(1 - on) * 20}px)`, border: `2px solid ${k === 0 ? F.amber : F.cyan}`, padding: "14px 22px", fontFamily: HUDF, fontSize: 30, letterSpacing: "0.14em", color: k === 0 ? F.amber : F.cyan, background: "rgba(5,10,20,0.6)" }}>{t}</div>;
        })}
      </div>
      <Hud size={24} color={F.ice} style={{ position: "absolute", left: PT ? 70 : 96, bottom: PT ? 380 : 96, maxWidth: PT ? 940 : undefined, lineHeight: 1.5, opacity: ip(f, [b(6), b(6) + 12], [0, 1]) }}>Profile · Listings · Reviews — from $549/mo · 1 location</Hud>
    </AbsoluteFill>
  );
};

/* ---------- 2. what the monthly work covers: six HUD panels ---------- */
const FEATS = [
  ["GOOGLE BUSINESS PROFILE", "Set up or cleaned up, then kept current: hours, photos, services and four posts a month."],
  ["A REPLY FOR EVERY REVIEW", "Drafted in your voice for every new review. Complaints come to you before anything is posted."],
  ["CONSISTENT LISTINGS", "Your name, address and phone checked across the main directories so the details match everywhere."],
  ["A NEW LOCAL PAGE EACH MONTH", "One new local or service page on your site each month, written for the searches your customers use."],
  ["REVIEW-REQUEST CARD", "A printable card and short link that make it easy for happy customers to leave a review."],
  ["ONE-PAGE MONTHLY REPORT", "By the 5th: profile views, calls, direction requests, new reviews and what was done last month."],
];
const Glass: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: F.panel, border: "1.5px solid rgba(46,230,255,0.45)", boxShadow: "0 0 40px rgba(46,230,255,0.15), inset 0 0 30px rgba(46,230,255,0.06)", borderRadius: 18, ...style }}>{children}</div>
);
const Stars: React.FC<{ n: number; size?: number }> = ({ n, size = 34 }) => (
  <span style={{ fontSize: size, letterSpacing: 4 }}>{[0, 1, 2, 3, 4].map((k) => <span key={k} style={{ color: k < n ? F.amber : F.dim }}>★</span>)}</span>
);
const Bar: React.FC<{ w: number | string; c?: string; h?: number }> = ({ w, c = "rgba(244,246,250,0.35)", h = 12 }) => <div style={{ width: w, height: h, borderRadius: 6, background: c }} />;

const Visual: React.FC<{ k: number; lf: number }> = ({ k, lf }) => {
  const a = (s: number, d = 10) => ip(lf, [s, s + d], [0, 1]);
  if (k === 0) return (
    <Glass style={{ width: 640, padding: 36, transform: `perspective(1400px) rotateY(${-18 + 10 * a(0, 30)}deg)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wide size={44} w={110}>YOUR BUSINESS</Wide><Hud size={18} color={F.amber}>● Open</Hud>
      </div>
      <div style={{ marginTop: 10, opacity: a(4) }}><Stars n={5} /></div>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>{[0, 1, 2].map((i) => <div key={i} style={{ flex: 1, height: 120, borderRadius: 10, background: `linear-gradient(135deg, ${[F.cobalt, F.coral, F.amber][i]}, #0c2240)`, opacity: a(6 + i * 3), transform: `scale(${0.8 + 0.2 * a(6 + i * 3)})` }} />)}</div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>{["HOURS", "PHOTOS", "SERVICES"].map((s, i) => <Hud key={s} size={16} color={F.cyan} style={{ border: "1px solid rgba(46,230,255,0.6)", padding: "6px 12px", opacity: a(12 + i * 3) }}>{s}</Hud>)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
        <Hud size={18} color={F.ice}>Posts this month</Hud>
        {[0, 1, 2, 3].map((i) => <div key={i} style={{ width: 46, height: 46, borderRadius: 8, background: F.amber, opacity: a(16 + i * 5, 6), transform: `translateY(${(1 - a(16 + i * 5, 6)) * -20}px)` }} />)}
        <Wide size={34} color={F.amber}>4</Wide>
      </div>
    </Glass>
  );
  if (k === 1) return (
    <div style={{ width: 660, display: "flex", flexDirection: "column", gap: 16 }}>
      {[5, 4, 2].map((n, i) => (
        <Glass key={i} style={{ padding: 22, opacity: a(i * 6), transform: `translateX(${(1 - a(i * 6)) * 80}px)`, borderColor: n < 3 ? F.coral : undefined }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><Stars n={n} size={28} /><Hud size={15} color={F.muted}>New review</Hud></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}><Bar w="85%" /><Bar w="60%" /></div>
          <Hud size={16} color={n < 3 ? F.coral : F.cyan} style={{ marginTop: 14, opacity: a(i * 6 + 10) }}>{n < 3 ? "→ Sent to you first" : "✓ Reply drafted in your voice"}</Hud>
        </Glass>
      ))}
    </div>
  );
  if (k === 2) {
    const fix = a(24, 8);
    return (
      <Glass style={{ width: 700, padding: 30 }}>
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr 1fr 40px", gap: "14px 16px", alignItems: "center" }}>
          {["", "NAME", "ADDRESS", "PHONE", ""].map((h, i) => <Hud key={i} size={15} color={F.muted}>{h}</Hud>)}
          {["MAPS", "DIRECTORY", "SOCIAL", "WEBSITE"].map((d, r) => {
            const bad = r === 2 && fix < 1, on = a(r * 4);
            return (
              <React.Fragment key={d}>
                <Hud size={18} color={F.ice} style={{ opacity: on }}>{d}</Hud>
                <Bar w="90%" c={on ? "rgba(46,230,255,0.6)" : "transparent"} />
                <Bar w={bad ? "55%" : "90%"} c={on ? (bad ? F.coral : "rgba(46,230,255,0.6)") : "transparent"} />
                <Bar w={bad ? "70%" : "90%"} c={on ? (bad ? F.coral : "rgba(46,230,255,0.6)") : "transparent"} />
                <Hud size={22} color={bad ? F.coral : F.amber} style={{ opacity: on }}>{bad ? "✕" : "✓"}</Hud>
              </React.Fragment>
            );
          })}
        </div>
      </Glass>
    );
  }
  if (k === 3) {
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return (
      <div style={{ width: 700 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {months.map((m, i) => {
            const on = a(i * 2.2, 5);
            return (
              <Glass key={m} style={{ height: 120, padding: 10, borderRadius: 10, opacity: 0.25 + 0.75 * on, borderColor: on > 0.9 ? F.amber : undefined }}>
                <Hud size={14} color={on > 0.9 ? F.amber : F.muted}>{m}</Hud>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, transform: `scaleY(${on})`, transformOrigin: "top" }}>
                  <Bar w="100%" h={18} c={i % 2 ? F.cobalt : F.cyan} /><Bar w="80%" h={6} /><Bar w="60%" h={6} /><Bar w="70%" h={6} />
                </div>
              </Glass>
            );
          })}
        </div>
        <Wide size={46} color={F.amber} style={{ marginTop: 24 }}>+1 PAGE EVERY MONTH</Wide>
      </div>
    );
  }
  if (k === 4) {
    // a 2D flip (scaleX through the edge) so it renders identically without GPU compositing
    const flip = ip(lf, [10, 30], [0, 180], inOut), back = flip > 90;
    const face = (isBack: boolean): React.CSSProperties => ({ position: "absolute", inset: 0, borderRadius: 18, padding: 34, boxSizing: "border-box", display: isBack === back ? undefined : "none" });
    return (
      <div style={{ width: 640, height: 380 }}>
        <div style={{ position: "relative", width: "100%", height: "100%", transform: `scaleX(${Math.max(0.02, Math.abs(Math.cos((flip * Math.PI) / 180)))}) skewY(${Math.sin((flip * Math.PI) / 180) * (back ? 4 : -4)}deg)` }}>
          <div style={{ ...face(false), background: "#F4F6FA", color: "#0F1B2D" }}>
            <div style={{ fontFamily: SERIF, fontSize: 58, lineHeight: 1.05 }}>Enjoyed our work?</div>
            <div style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 500), fontSize: 30, marginTop: 18 }}>A quick review helps neighbours find us.</div>
            <div style={{ position: "absolute", bottom: 30, left: 34 }}><Stars n={5} size={44} /></div>
          </div>
          <div style={{ ...face(true), background: "#0F1B2D", border: `2px solid ${F.amber}`, display: "flex", gap: 30, alignItems: "center" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 22px)", gap: 3 }}>
              {Array.from({ length: 81 }, (_, i) => <div key={i} style={{ width: 22, height: 22, background: random(`q${i}`) > 0.5 || [0, 8, 72].includes(i) ? F.ice : "transparent" }} />)}
            </div>
            <div><Hud size={18} color={F.muted}>Scan or tap</Hud><Wide size={40} color={F.amber} style={{ marginTop: 10 }}>SHORT LINK</Wide><Hud size={16} color={F.ice} style={{ marginTop: 12 }}>→ your review page</Hud></div>
          </div>
        </div>
      </div>
    );
  }
  const rows = ["PROFILE VIEWS", "CALLS", "DIRECTION REQUESTS", "NEW REVIEWS"];
  return (
    <Glass style={{ width: 640, padding: 34, transform: `translateY(${(1 - a(0, 14)) * 120}px)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wide size={36} w={110}>MONTHLY REPORT</Wide>
        <div style={{ border: `3px solid ${F.amber}`, color: F.amber, fontFamily: HUDF, fontSize: 18, padding: "6px 12px", letterSpacing: "0.12em", transform: `rotate(-6deg) scale(${1 + Math.max(0, 1 - (lf - 26) / 6) * 0.4 * (lf > 26 ? 1 : 0)})`, opacity: a(26, 4) }}>BY THE 5TH</div>
      </div>
      {rows.map((r, i) => (
        <div key={r} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 20 }}>
          <Hud size={16} color={F.ice} style={{ width: 230 }}>{r}</Hud>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 40 }}>
            {Array.from({ length: 14 }, (_, j) => <div key={j} style={{ width: 14, height: `${(25 + 75 * random(`r${i}${j}`)) * a(6 + i * 3 + j * 0.6, 8)}%`, background: j === 13 ? F.amber : F.cyan, opacity: 0.85 }} />)}
          </div>
        </div>
      ))}
      <Hud size={15} color={F.muted} style={{ marginTop: 22 }}>+ What was done last month</Hud>
    </Glass>
  );
};
export const Features: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  const k = Math.min(5, Math.floor(f / b(2))), lf = f - b(k * 2);
  const [name, desc] = FEATS[k];
  const enter = ip(lf, [0, 12], [0, 1]);
  const slice = lf < 5 ? (5 - lf) * 14 : 0;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 70% 50%, #0b2038 0%, ${F.bg} 70%)` }}>
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(46,230,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(46,230,255,0.06) 1px, transparent 1px)", backgroundSize: "60px 60px", transform: `translateY(${(f * 0.6) % 60}px)` }} />
      <Hud size={20} style={{ position: "absolute", left: P ? 70 : 96, top: P ? 240 : 120 }}>0{k + 1} / 06 — What the monthly work covers</Hud>
      <div style={{ position: "absolute", left: P ? 70 : 96, top: P ? 310 : 300, width: P ? 940 : 900, transform: `translateX(${(1 - enter) * -60}px)`, opacity: enter }}>
        <div style={{ position: "relative" }}>
          <Wide size={P ? 72 : 78} style={{ clipPath: "inset(0 0 50% 0)", position: "absolute", transform: `translateX(${slice}px)` }}>{name}</Wide>
          <Wide size={P ? 72 : 78} style={{ clipPath: "inset(50% 0 0 0)", transform: `translateX(${-slice}px)` }}>{name}</Wide>
        </div>
        <div style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 400), fontSize: P ? 34 : 36, lineHeight: 1.35, color: F.muted, marginTop: 30, maxWidth: P ? 920 : 780 }}>{desc}</div>
      </div>
      <div style={P ? { position: "absolute", left: 540, top: 1180, transform: `translate(-50%, -50%) scale(${0.88 + 0.08 * enter})`, opacity: enter } : { position: "absolute", right: 110, top: 540, transform: `translateY(-50%) scale(${0.92 + 0.08 * enter})`, opacity: enter }}><Visual k={k} lf={lf} /></div>
      <div style={{ position: "absolute", left: P ? 70 : 96, bottom: P ? 400 : 110, display: "flex", gap: 10 }}>{FEATS.map((_, i) => <div key={i} style={{ width: 60, height: 6, background: i <= k ? F.amber : F.dim }} />)}</div>
    </AbsoluteFill>
  );
};

/* ---------- 3. how it works: a lit circuit ---------- */
const STEPS = [["BRIEF", "Your business, your area and the searches you want to show up for."], ["PROPOSE", "A written proposal with monthly scope, price and roles. Or start with the free check."], ["MAKE", "The profile is cleaned up first. Then the monthly work runs, drafts shared first."], ["DELIVER", "A one-page report by the 5th of each month."]];
export const Steps: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  if (P) {
    const x = 150, ys = [560, 820, 1080, 1340], prog = ip(f, [0, b(3.2)], [0, 1], (t) => t);
    return (
      <AbsoluteFill style={{ background: F.bg }}>
        <Hud size={20} style={{ position: "absolute", left: 70, top: 240, maxWidth: 940, lineHeight: 1.5 }}>How it works — from brief to monthly report</Hud>
        <svg width="1080" height="1920" style={{ position: "absolute", inset: 0 }}>
          <path d={`M ${x} ${ys[0]} L ${x} ${ys[3]}`} stroke={F.dim} strokeWidth={4} />
          <path d={`M ${x} ${ys[0]} L ${x} ${ys[3]}`} stroke={F.amber} strokeWidth={6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog} style={{ filter: "drop-shadow(0 0 12px #F5A524)" }} />
          {ys.map((y, k) => {
            const on = f >= b(k), pulse = on ? Math.max(0, 1 - (f - b(k)) / 14) : 0;
            return (
              <g key={k}>
                <circle cx={x} cy={y} r={46 + pulse * 20} fill="none" stroke={F.amber} strokeOpacity={pulse} strokeWidth={3} />
                <circle cx={x} cy={y} r={34} fill={on ? F.amber : F.bg} stroke={on ? F.amber : F.dim} strokeWidth={4} />
                <text x={x} y={y + 10} textAnchor="middle" fontFamily={HUDF} fontSize="28" fill={on ? F.bg : F.muted}>{k + 1}</text>
              </g>
            );
          })}
        </svg>
        {ys.map((y, k) => {
          const on = ip(f, [b(k), b(k) + 10], [0, 1]);
          return (
            <div key={k} style={{ position: "absolute", left: 240, top: y - 34, width: 770, opacity: 0.25 + 0.75 * on, transform: `translateX(${(1 - on) * 24}px)` }}>
              <Wide size={54} color={on > 0.5 ? F.ice : F.muted}>{STEPS[k][0]}</Wide>
              <div style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 400), fontSize: 30, lineHeight: 1.35, color: F.muted, marginTop: 12 }}>{STEPS[k][1]}</div>
            </div>
          );
        })}
        <Hud size={22} color={F.ice} style={{ position: "absolute", left: 70, right: 70, bottom: 380, textAlign: "center", lineHeight: 1.5, opacity: ip(f, [b(3.2), b(3.2) + 10], [0, 1]) }}>Cancel with 30 days' notice · the profile, the pages and the reviews stay yours</Hud>
      </AbsoluteFill>
    );
  }
  const xs = [260, 720, 1180, 1640], y = 470;
  const prog = ip(f, [0, b(3.2)], [0, 1], (x) => x);
  return (
    <AbsoluteFill style={{ background: F.bg }}>
      <Hud size={20} style={{ position: "absolute", left: 96, top: 120 }}>How it works — from brief to monthly report</Hud>
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
        <path d={`M ${xs[0]} ${y} L ${xs[3]} ${y}`} stroke={F.dim} strokeWidth={4} />
        <path d={`M ${xs[0]} ${y} L ${xs[3]} ${y}`} stroke={F.amber} strokeWidth={6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog} style={{ filter: "drop-shadow(0 0 12px #F5A524)" }} />
        {xs.map((x, k) => {
          const on = f >= b(k), pulse = on ? Math.max(0, 1 - (f - b(k)) / 14) : 0;
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={46 + pulse * 20} fill="none" stroke={F.amber} strokeOpacity={pulse} strokeWidth={3} />
              <circle cx={x} cy={y} r={34} fill={on ? F.amber : F.bg} stroke={on ? F.amber : F.dim} strokeWidth={4} />
              <text x={x} y={y + 10} textAnchor="middle" fontFamily={HUDF} fontSize="28" fill={on ? F.bg : F.muted}>{k + 1}</text>
            </g>
          );
        })}
      </svg>
      {xs.map((x, k) => {
        const on = ip(f, [b(k), b(k) + 10], [0, 1]);
        return (
          <div key={k} style={{ position: "absolute", left: x - 190, top: y + 80, width: 380, textAlign: "center", opacity: 0.25 + 0.75 * on, transform: `translateY(${(1 - on) * 24}px)` }}>
            <Wide size={50} color={on > 0.5 ? F.ice : F.muted}>{STEPS[k][0]}</Wide>
            <div style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 400), fontSize: 25, lineHeight: 1.35, color: F.muted, marginTop: 14 }}>{STEPS[k][1]}</div>
          </div>
        );
      })}
      <Hud size={22} color={F.ice} style={{ position: "absolute", left: 0, right: 0, bottom: 120, textAlign: "center", opacity: ip(f, [b(3.2), b(3.2) + 10], [0, 1]) }}>Cancel with 30 days' notice · the profile, the pages and the reviews stay yours</Hud>
    </AbsoluteFill>
  );
};

/* ---------- 4. the specialist line-up, orbiting one lead ---------- */
const ROLES = [["SEO SPECIALIST", "Local pages, titles and listing consistency"], ["CONTENT CREATOR", "Profile posts, review replies, new local pages"], ["ANSWER ENGINE VISIBILITY STRATEGIST", "Your details, right in answer-style results"], ["TRACKING & MEASUREMENT SPECIALIST", "Call and form tracking that counts real enquiries"], ["ANALYTICS REPORTER", "Turns the month's numbers into one page"], ["PPC CAMPAIGN STRATEGIST", "Google search ads (ads add-on)"], ["PAID SOCIAL STRATEGIST", "Facebook and Instagram ads (ads add-on)"]];
export const Roles: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  const ocx = P ? 540 : 960, ocy = P ? 820 : 470, rx = P ? 250 : 640, ry = P ? 380 : 230;
  const cur = Math.min(6, Math.floor(f / b(0.5)));
  const spin = f * 0.012;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 46%, #0d2442 0%, ${F.bg} 60%)` }}>
      <Hud size={20} style={{ position: "absolute", left: P ? 70 : 96, top: P ? 240 : 120 }}>The line-up for this work</Hud>
      <div style={{ position: "absolute", left: ocx, top: ocy, transform: "translate(-50%, -50%)", filter: "drop-shadow(0 0 30px rgba(245,165,36,0.6))" }}><MLogo height={P ? 170 : 150} /></div>
      {ROLES.map(([r], k) => {
        const a = (k / 7) * Math.PI * 2 + spin, x = ocx + Math.cos(a) * rx, y = ocy + Math.sin(a) * ry, depth = P ? (Math.cos(a) + 1) / 2 : (Math.sin(a) + 1) / 2;
        const lit = f >= b(k * 0.5);
        return (
          <div key={r} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${0.7 + depth * 0.4})`, zIndex: Math.round(depth * 10), opacity: 0.35 + depth * 0.65,
            border: `2px solid ${lit ? (k === cur ? F.amber : F.cyan) : F.dim}`, background: "rgba(5,10,20,0.75)", padding: "10px 18px", borderRadius: 40, boxShadow: k === cur ? "0 0 30px rgba(245,165,36,0.6)" : undefined }}>
            <Hud size={18} color={lit ? (k === cur ? F.amber : F.cyan) : F.muted}>{r}</Hud>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: P ? 60 : 0, right: P ? 60 : 0, top: P ? 1290 : 790, textAlign: "center" }}>
        <Wide size={54} color={F.amber}><Scramble text={ROLES[cur][0]} f={f} start={b(cur * 0.5)} speed={0.6} /></Wide>
        <div style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 400), fontSize: 32, color: F.muted, marginTop: 14 }}>{ROLES[cur][1]}</div>
      </div>
      <Hud size={18} color={F.ice} style={{ position: "absolute", left: P ? 70 : 0, right: P ? 70 : 0, bottom: P ? 370 : 70, textAlign: "center", lineHeight: 1.6 }}>Coordinated by an Engagement Lead · the founder stays your single point of contact</Hud>
    </AbsoluteFill>
  );
};

/* ---------- 5. packages ---------- */
const BULLETS = ["Google Business Profile: 4 posts a month", "Drafted replies to reviews", "Photo and hours upkeep", "1 new local or service page a month", "Listing consistency checks", "1-page monthly report", "Includes Site Care: backups, uptime and form checks, 2 small edits"];
export const Packages: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  const a = (s: number, d = 10) => ip(f, [s, s + d], [0, 1]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 35% 50%, #10284a 0%, ${F.bg} 70%)` }}>
      <Hud size={20} style={{ position: "absolute", left: P ? 60 : 96, top: P ? 200 : 110 }}>Packages, limits and turnaround</Hud>
      <Glass style={{ position: "absolute", left: P ? 50 : 96, top: P ? 250 : 170, width: P ? 980 : 1000, height: P ? 800 : 760, padding: P ? 40 : 50, boxSizing: "border-box", borderColor: F.amber, transform: `translateY(${(1 - a(0, 14)) * 60}px)`, opacity: a(0, 8) }}>
        <Hud size={20} color={F.amber}>Monthly</Hud>
        <div style={{ display: "flex", flexDirection: P ? "column" : "row", alignItems: P ? "flex-start" : "baseline", justifyContent: "space-between", marginTop: 10, gap: P ? 10 : 0 }}>
          <Wide size={P ? 64 : 72}>LOCAL VISIBILITY</Wide>
          <Wide size={84} color={F.amber}>$549<span style={{ fontSize: 34 }}>/MO</span></Wide>
        </div>
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 12 }}>
          {BULLETS.map((t, k) => (
            <div key={t} style={{ display: "flex", gap: 16, alignItems: "center", opacity: a(6 + k * 4, 6), transform: `translateX(${(1 - a(6 + k * 4, 6)) * 40}px)` }}>
              <span style={{ color: F.amber, fontFamily: HUDF, fontSize: 26 }}>✓</span>
              <span style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 450), fontSize: P ? 27 : 31, color: F.ice }}>{t}</span>
            </div>
          ))}
        </div>
        <Hud size={20} color={F.cyan} style={{ marginTop: 26 }}>1 location · report by the 5th of each month</Hud>
        {P && <Hud size={15} color={F.muted} style={{ marginTop: 14, lineHeight: 1.6 }}>Billed monthly on the 1st · 30 days' notice · no long contract · South Africa: R2,950/mo</Hud>}
      </Glass>
      {[
        ["ADD-ON · PAID ADS", "QUOTED IN WRITING", "Google search ads, Facebook and Instagram if they fit, call and form tracking. Ad spend paid to Google or Meta directly."],
        ["NO SITE YET?", "WEBSITE STARTER · $3,500 FIXED", "Up to 6 pages built for phones, Google profile setup included. 15 business days after content."],
        ["GET FOUND BUNDLE", "$2,995 SETUP + $1,325/MO", "Website Starter, Local Visibility and Social Starter. 6-month minimum."],
      ].map(([k, v, d], i) => (
        <Glass key={k} style={{ position: "absolute", left: P ? 50 : 1150, top: P ? 1070 + i * 168 : 170 + i * 260, width: P ? 980 : 680, height: P ? 156 : 230, padding: P ? 20 : 30, boxSizing: "border-box", opacity: a(14 + i * 8), transform: `translateX(${(1 - a(14 + i * 8)) * 80}px)` }}>
          <Hud size={17} color={F.muted}>{k}</Hud>
          <Wide size={P ? 30 : 36} color={i === 0 ? F.cyan : F.ice} style={{ marginTop: P ? 6 : 10 }}>{v}</Wide>
          <div style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 400), fontSize: P ? 19 : 22, lineHeight: 1.35, color: F.muted, marginTop: P ? 8 : 12 }}>{d}</div>
        </Glass>
      ))}
      {!P && <Hud size={17} color={F.muted} style={{ position: "absolute", left: 96, bottom: 74 }}>Billed monthly on the 1st · 30 days' notice to cancel · no long contract · South Africa: R2,950/mo</Hud>}
    </AbsoluteFill>
  );
};

/* ---------- 6. the honest answer (black and white, a serif callback to 1975) ---------- */
export const Honest: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  const q = "Can anyone guarantee the top spot on the map?";
  const qa = ip(f, [0, 10], [0, 1]), aa = ip(f, [b(1.5), b(1.5) + 8], [0, 1]), pa = ip(f, [b(2.5), b(2.5) + 12], [0, 1]);
  return (
    <AbsoluteFill style={{ background: "#000", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontFamily: SERIF, fontSize: P ? 68 : 70, color: "#F4F6FA", opacity: qa * (1 - aa * 0.55), maxWidth: P ? 920 : 1500, lineHeight: 1.15 }}>{q}</div>
      <div style={{ fontFamily: SERIF, fontSize: P ? 128 : 150, lineHeight: 1.05, maxWidth: P ? 940 : undefined, color: F.amber, marginTop: 40, opacity: aa, transform: `scale(${1.15 - 0.15 * aa})` }}>No one honestly can.</div>
      <div style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 400), fontSize: P ? 38 : 36, color: "#F4F6FA", marginTop: 44, opacity: pa, maxWidth: P ? 900 : 1400, lineHeight: 1.4 }}>
        What is promised: the work in the plan, done every month, and a report that shows the results.
      </div>
    </AbsoluteFill>
  );
};

/* ---------- 7. warp: month after month ---------- */
export const Warp: React.FC<{ f: number }> = ({ f }) => {
  const { V: P, W, H } = useL();
  const speed = ip(f, [0, b(3.5)], [0.4, 6], (x) => x * x);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const mi = Math.min(11, Math.floor(ip(f, [0, b(3.4)], [0, 12], (x) => x * x)));
  const draw = (ctx: CanvasRenderingContext2D, fr: number) => {
    const T = fr / 60;
    for (let i = 0; i < 420; i++) {
      const ang = random(`wa${i}`) * Math.PI * 2, base = random(`wz${i}`);
      const z = (base + T * speed * 0.35) % 1, r = Math.pow(z, 2.2) * 1300, r2 = Math.pow(Math.max(0, z - 0.012 * speed), 2.2) * 1300;
      const col = i % 5 === 0 ? "245,165,36" : i % 3 === 0 ? "46,91,255" : "46,230,255";
      ctx.strokeStyle = `rgba(${col},${Math.min(1, z * 1.6)})`; ctx.lineWidth = 1 + z * 3;
      const ex = P ? 0.75 : 1, ey = P ? 1.3 : 0.75;
      ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(ang) * r2 * ex, H / 2 + Math.sin(ang) * r2 * ey); ctx.lineTo(W / 2 + Math.cos(ang) * r * ex, H / 2 + Math.sin(ang) * r * ey); ctx.stroke();
    }
  };
  if (f >= b(3.5)) return <AbsoluteFill style={{ background: "#000" }} />;
  const st = f >= b(3);
  return (
    <AbsoluteFill style={{ background: F.bg, transform: st ? `scale(${1 + ((f - b(3)) / b(0.5)) * 0.25})` : undefined }}>
      <GlowCanvas f={f} draw={draw} glow={1} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Hud size={30} color={F.cyan}>{months[mi]} · report by the 5th</Hud>
        <Wide size={P ? 160 : 104} style={{ marginTop: 20, whiteSpace: P ? "pre" : "nowrap", textAlign: "center", textShadow: st ? `${6 + (f - b(3))}px 0 #FF3B5C, ${-6 - (f - b(3))}px 0 #2EE6FF` : undefined }}>{P ? "MONTH\nAFTER\nMONTH." : "MONTH AFTER MONTH."}</Wide>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- Act III: land ---------- */
export const Land: React.FC<{ f: number; spring: (fr: number, cfg?: object) => number }> = ({ f, spring }) => {
  const { V: P } = useL();
  const a = (beat: number, d = 14) => ip(f, [b(beat), b(beat) + d], [0, 1]);
  const flash = f < 8 ? 1 - f / 8 : 0;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #0d2442 0%, ${F.bg} 65%)` }}>
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(46,230,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(46,230,255,0.07) 1px, transparent 1px)", backgroundSize: "60px 60px", opacity: a(0.3, 30) }} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: P ? 300 : 110, paddingLeft: P ? 60 : 0, paddingRight: P ? 60 : 0 }}>
        <div style={{ filter: "drop-shadow(0 0 28px rgba(245,165,36,0.5))" }}>
          <MLogo height={P ? 220 : 170} piece={(i) => {
            const s = spring(f - [0, 2, 7, 1][i], i === 2 ? { damping: 9, stiffness: 140, mass: 0.8 } : { damping: 15, stiffness: 170 });
            const from = [[-520, 260], [-260, -520], [520, -520], [520, 260]][i];
            return { dx: from[0] * (1 - s), dy: from[1] * (1 - s), rot: [-90, 60, -140, 90][i] * (1 - s), o: Math.min(1, s * 3) };
          }} />
        </div>
        <Wide size={P ? 76 : 74} style={{ marginTop: 46, textAlign: "center", opacity: a(0.6), whiteSpace: "pre" }}>{P ? "SHOW UP WHEN\nPEOPLE NEARBY" : "SHOW UP WHEN PEOPLE NEARBY"}</Wide>
        <Wide size={P ? 76 : 74} color={F.amber} style={{ marginTop: 8, textAlign: "center", opacity: a(0.9), whiteSpace: "pre" }}>{P ? "SEARCH FOR\nWHAT YOU DO." : "SEARCH FOR WHAT YOU DO."}</Wide>
        <Hud size={P ? 26 : 28} color={F.ice} style={{ marginTop: 40, opacity: a(1.6), textAlign: "center" }}>Local Visibility · from $549/mo · 1 location</Hud>
        <div style={{ marginTop: 30, border: `2px solid ${F.cyan}`, padding: "16px 30px", opacity: a(2.4), transform: `translateY(${(1 - a(2.4)) * 20}px)`, textAlign: "center" }}>
          <Hud size={22} color={F.cyan}>Free "Found on Google" check</Hud>
          <div style={{ fontFamily: WIDE, fontVariationSettings: wv(100, 400), fontSize: 26, color: F.muted, marginTop: 8, maxWidth: P ? 840 : undefined, lineHeight: 1.4 }}>10 things to check yourself · by email within 3 business days · no call needed</div>
        </div>
        <Wide size={58} w={110} g={700} style={{ marginTop: 40, opacity: a(3.2) }}>manywright.com</Wide>
      </AbsoluteFill>
      <Hud size={16} color={F.muted} style={{ position: "absolute", left: P ? 70 : 0, right: P ? 70 : 0, bottom: P ? 370 : 44, textAlign: "center", lineHeight: 1.6, opacity: a(4.5) }}>Founding terms until 31 January 2027: 50% off the first month for the first five paying clients</Hud>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};
