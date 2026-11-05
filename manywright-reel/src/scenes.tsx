import React from "react";
import { AbsoluteFill, spring } from "remotion";
import { b, BF, C, DISPLAY, fit, fitLines, inExpo, inOut, ip, Lines, M_PIECES, M_VIEW, MLogo, Mono, MONO, pulse, Txt, useL, vf } from "./lib";

const DISCIPLINES: [string, number][] = [
  ["ENGINEERING", 57], ["SPECIALIZED", 45], ["MARKETING", 25], ["SECURITY", 11], ["DESIGN", 10],
  ["SALES", 9], ["TESTING", 9], ["PAID MEDIA", 7], ["PROJECT MGMT", 7], ["SUPPORT", 7],
  ["PRODUCT", 6], ["FINANCE", 5], ["RESEARCH", 1],
];
const SERVICES: [string, string, string, string][] = [
  ["WEBSITES", "FROM $3,500", C.amber, C.navy],
  ["LOCAL SEARCH", "FROM $549/MO", C.coral, C.navy],
  ["SOCIAL + EMAIL", "FROM $995/MO", C.ice, C.navy],
  ["BOOKKEEPING", "FROM $495/MO", C.cobalt, C.ice],
  ["CUSTOMER INBOX", "FROM $450/MO", C.navy, C.amber],
  ["BOOKINGS", "FROM $1,000", C.amber, C.cobalt],
  ["BRAND", "FROM $1,250", C.coral, C.ice],
  ["SECURITY", "FROM $1,750", C.ice, C.coral],
];
const PIECES = [C.amber, C.coral, C.ice, C.cobalt];
// in portrait, multi-word phrases stack one word per line
const split = (s: string, V: boolean) => (V ? s.split(" ") : [s]);

/* ============ 1. HOOK  (beats 0–4) : slam type, colour invert, 16th stutter ============ */
export const Hook: React.FC<{ f: number }> = ({ f }) => {
  const { V, W, H, M } = useL();
  const inv = f >= b(2) && f < b(3);
  const stut = f >= b(3);
  const s16 = Math.floor((f - b(3)) / (BF / 4));
  let bg = C.navy, fg = C.ice, acc = C.amber;
  if (inv) { bg = C.amber; fg = C.navy; acc = C.navy; }
  if (stut) { const alt = s16 % 2 === 0; bg = alt ? C.ice : C.navy; fg = alt ? C.navy : C.amber; }
  const flash = f < 7 ? 1 - f / 7 : 0;
  const evS = ip(f, [0, 12], [2.1, 1]);
  const evBlur = ip(f, [0, 8], [18, 0]);
  const spY = ip(f, [b(1), b(1) + 12], [110, 0]);
  const spW = ip(f, [b(1), b(1) + 22], [62, H > W ? 92 : 125]);
  const drift = ip(f, [b(2), b(3)], [0, 1], inOut);
  const bar = ip(f, [b(1) + 4, b(2)], [0, 1]);
  const p16 = stut ? pulse(f - b(3), 4, 5) : 0;
  const TW = W - 2 * M;
  const evW = V ? 110 : 125, spMax = V ? 92 : 125;
  const evSize = V ? fit("EVERY", evW, TW, 400) : 372, spSize = V ? fit("SPECIALIST.", spMax, TW, 200) : 196;
  const firm = split("ONE FIRM.", V), firmW = V ? 110 : 125, firmSize = V ? fitLines(firm, firmW, TW, 380) : 236;
  return (
    <AbsoluteFill style={{ background: bg }}>
      {!stut && (
        <div style={{ position: "absolute", left: M, top: V ? H * 0.34 : 210 }}>
          <div style={{ transform: `translateX(${-60 * drift}px) scale(${evS})`, transformOrigin: "0% 60%", filter: `blur(${evBlur}px)` }}>
            <Txt w={evW} g={900} size={evSize} color={fg}>EVERY</Txt>
          </div>
          <div style={{ overflow: "hidden", height: spSize * 1.02, marginTop: 10 }}>
            <div style={{ transform: `translate(${60 * drift}px, ${spY}%)` }}>
              <Txt w={spW} g={900} size={spSize} color={fg}>SPECIALIST<span style={{ color: acc }}>.</span></Txt>
            </div>
          </div>
          <div style={{ height: 14, width: (V ? W - 2 * M : 1500) * bar, background: acc, marginTop: 26 }} />
        </div>
      )}
      {stut && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${1 + p16 * 0.09})` }}>
          {[0, 1].map((half) => (
            <div key={half} style={{
              position: "absolute",
              clipPath: half ? "inset(50% 0 0 0)" : "inset(0 0 50% 0)",
              transform: `translateX(${(s16 % 2 ? 1 : -1) * (half ? 1 : -1) * 34 * p16}px)`,
            }}>
              <Lines lines={firm} w={firmW} size={firmSize} color={fg} align="center" />
            </div>
          ))}
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: C.amber, opacity: flash }} />
    </AbsoluteFill>
  );
};

/* ============ 2. DISCIPLINES (beats 4–12) : 13 type treatments on 8ths + rolling counter ============ */
const WORD_LEN = BF / 2;
const Discipline: React.FC<{ i: number; lf: number }> = ({ i, lf }) => {
  const { V, W, H, CY, M, BOT } = useL();
  const TW = W - 2 * M; // usable text width
  const [name, count] = DISCIPLINES[i];
  const words = split(name, V);
  const t = i % 5;
  const label = (
    <Mono size={22} color={t === 2 || t === 4 ? C.navy : C.muted} style={{ position: "absolute", left: M, bottom: BOT }}>
      {String(i + 1).padStart(2, "0")} / 13 — {name} — {count} {count === 1 ? "role" : "roles"}
    </Mono>
  );
  if (t === 0) {
    const w = ip(lf, [0, 12], [62, 125]);
    const size = fitLines(words, 125, TW, 330);
    return (
      <AbsoluteFill style={{ background: C.navy, alignItems: "center", justifyContent: "center" }}>
        <Lines lines={words} w={w} size={size} align="center" txtStyle={{ letterSpacing: `${ip(lf, [0, 12], [0.25, -0.01])}em` }} />
        <div style={{ position: "absolute", top: CY + size * 0.5 * words.length + (V ? 10 : 0), height: 10, width: TW * ip(lf, [0, 12], [0, 1]), background: C.amber }} />
        {label}
      </AbsoluteFill>
    );
  }
  if (t === 1) {
    const size = fit(name, 110, TW, 170);
    const scroll = ip(lf, [0, 14], [size * 0.9, 0]);
    const rows = V ? [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7] : [-3, -2, -1, 0, 1, 2, 3];
    return (
      <AbsoluteFill style={{ background: C.navy, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {rows.map((r) => (
          <div key={r} style={{ position: "absolute", transform: `translateY(${r * size * 0.9 + scroll * (r === 0 ? 0 : 1)}px)` }}>
            <Txt w={110} size={size} color={r === 0 ? C.amber : "transparent"} style={{ WebkitTextStroke: r === 0 ? undefined : `2px ${C.ice}`, opacity: r === 0 ? 1 : Math.max(0.08, 0.55 - Math.abs(r) * (V ? 0.06 : 0.1)) }}>{name}</Txt>
          </div>
        ))}
        {label}
      </AbsoluteFill>
    );
  }
  if (t === 2) {
    const size = fitLines(words, 100, TW, 300);
    return (
      <AbsoluteFill style={{ background: C.ice, alignItems: "center", justifyContent: "center" }}>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <div key={s} style={{
            position: "absolute", clipPath: `inset(${s * 16.66}% 0 ${100 - (s + 1) * 16.66}% 0)`,
            transform: `translateX(${(s % 2 ? 1 : -1) * ip(lf, [0, 11], [420 + s * 40, 0])}px)`,
          }}>
            <Lines lines={words} w={100} size={size} color={C.navy} align="center" />
          </div>
        ))}
        {label}
      </AbsoluteFill>
    );
  }
  if (t === 3) {
    const size = V ? Math.min(250, 1350 / (name.length * 0.55)) : Math.min(230, 1000 / (name.length * 0.55));
    return (
      <AbsoluteFill style={{ background: C.navy }}>
        <div style={{ position: "absolute", left: V ? W - 190 : 1720, top: CY, transform: `translate(-50%, -50%) rotate(-90deg) translateX(${ip(lf, [0, 12], [-260, 0])}px)` }}>
          <Txt w={78} size={size} color={C.amber}>{name}</Txt>
        </div>
        <div style={{ position: "absolute", left: M, top: V ? H * 0.3 : 250, transform: `translateY(${ip(lf, [0, 10], [60, 0])}px)` }}>
          <Txt w={125} size={V ? 400 : 460} color={C.ice}>{count}</Txt>
          <Mono size={30} color={C.muted} style={{ marginTop: 30 }}>{count === 1 ? "specialist role" : "specialist roles"}</Mono>
        </div>
        {label}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: C.coral, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: V ? CY - 560 : 120, transform: `translateX(${ip(lf, [0, 15], [260, -520], (x) => x)}px)` }}>
        <Txt w={125} size={V ? 1150 : 820} color={C.navy}>{name}</Txt>
      </div>
      {label}
    </AbsoluteFill>
  );
};

const Roller: React.FC<{ digit: number; land: number; f: number; size: number }> = ({ digit, land, f, size }) => {
  const total = 20 + digit; // spin through two full cycles then land
  const pos = ip(f, [0, land], [0, total]);
  return (
    <div style={{ height: size * 0.86, overflow: "hidden" }}>
      <div style={{ transform: `translateY(${-pos * size * 0.86}px)` }}>
        {Array.from({ length: total + 1 }, (_, n) => <Txt key={n} w={125} size={size} color={C.amber}>{n % 10}</Txt>)}
      </div>
    </div>
  );
};

export const Disciplines: React.FC<{ f: number }> = ({ f }) => {
  const { V, M } = useL();
  const cStart = b(6.5);
  if (f < cStart) {
    const i = Math.min(12, Math.floor(f / WORD_LEN));
    return <Discipline i={i} lf={f - i * WORD_LEN} />;
  }
  const lf = f - cStart;
  return (
    <AbsoluteFill style={{ background: C.navy, justifyContent: "center", paddingLeft: M }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 9, 9].map((d, i) => <Roller key={i} digit={d} land={14 + i * 7} f={lf} size={V ? 330 : 470} />)}
      </div>
      <div style={{ marginTop: 34, opacity: ip(lf, [10, 22], [0, 1]), transform: `translateY(${ip(lf, [10, 22], [24, 0])}px)` }}>
        <Lines lines={V ? ["SPECIALIST", "ROLES"] : ["SPECIALIST ROLES"]} size={V ? 120 : 96} />
        <Mono size={V ? 24 : 28} color={C.muted} style={{ marginTop: 18 }}>13 disciplines · one bench · one firm</Mono>
      </div>
    </AbsoluteFill>
  );
};

/* ============ 3. SHAPES (beats 12–16) : four pieces assemble, rotate, morph, become the M ============ */
export const Shapes: React.FC<{ f: number }> = ({ f }) => {
  const { V, W, CX, CY, M, TOP } = useL();
  const S = V ? 230 : 210;
  const home = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => [x * S / 2, y * S / 2]);
  const from = V ? [[-900, -1200], [900, -1200], [-900, 1200], [900, 1200]] : [[-1200, -760], [1200, -760], [-1200, 760], [1200, 760]];
  // landscape: a row; portrait: a column with labels to the right
  const row = V ? [-1.5, -0.5, 0.5, 1.5].map((y) => [-170, y * 250]) : [-1.5, -0.5, 0.5, 1.5].map((x) => [x * 330, -20]);
  const names = ["BRIEF", "PROPOSE", "MAKE", "DELIVER"];
  const rot = ip(f, [b(0.5), b(1)], [0, 45]);
  const toRow = ip(f, [b(1), b(1.6)], [0, 1]);
  const toDots = ip(f, [b(3), b(3.16)], [0, 1]);
  const headline = f < b(2) ? "FOUR PIECES." : "ONE WAY OF WORKING.";
  const hf = f < b(2) ? f : f - b(2);
  const hl = V ? (f < b(2) ? ["FOUR", "PIECES."] : ["ONE WAY", "OF WORKING."]) : [headline];
  const hSize = V ? 112 : 104, hH = V ? hSize * 0.9 * hl.length + 10 : 110;
  const cy0 = V ? CY + 80 : 560;
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <div style={{ position: "absolute", left: M, top: TOP, overflow: "hidden", height: hH }}>
        <div style={{ transform: `translateY(${ip(hf, [0, 12], [hH, 0])}px)` }}>
          <Lines lines={hl} w={112} g={850} size={hSize} />
        </div>
      </div>
      {PIECES.map((col, i) => {
        const a = ip(f, [i * 2, i * 2 + 16], [0, 1]);
        const ang = (rot * Math.PI) / 180;
        const hx = home[i][0] * Math.cos(ang) - home[i][1] * Math.sin(ang);
        const hy = home[i][0] * Math.sin(ang) + home[i][1] * Math.cos(ang);
        let x = from[i][0] + (hx - from[i][0]) * a, y = from[i][1] + (hy - from[i][1]) * a;
        x = x + (row[i][0] - x) * toRow; y = y + (row[i][1] - y) * toRow;
        const hit = b(2 + i * 0.25);
        const bounce = f >= hit ? Math.exp(-(f - hit) / 5) : 0;
        const size = S * (1 - toRow * (V ? 0.22 : 0.15)) * (1 + bounce * 0.28) * (1 - toDots);
        const r = ip(f, [b(1), b(1.6)], [0, 50]);
        const spin = (1 - a) * 220 + rot * (1 - toRow);
        const labelStyle: React.CSSProperties = V
          ? { position: "absolute", left: CX + row[i][0] + 140, top: cy0 + row[i][1], transform: `translate(${ip(f - hit, [0, 10], [20, 0])}px, -50%)`, opacity: ip(f - hit, [0, 6], [0, 1]) }
          : { position: "absolute", left: CX + row[i][0], top: 720, transform: `translate(-50%, ${ip(f - hit, [0, 10], [20, 0])}px)`, opacity: ip(f - hit, [0, 6], [0, 1]) };
        return (
          <React.Fragment key={i}>
            <div style={{
              position: "absolute", left: CX + x - size / 2, top: cy0 + y - size / 2, width: size, height: size,
              background: col, borderRadius: `${r}%`, transform: `rotate(${spin}deg)`,
            }} />
            {f >= hit && toDots < 0.3 && (
              <Mono size={V ? 40 : 30} color={col} style={labelStyle}>0{i + 1} {names[i]}</Mono>
            )}
          </React.Fragment>
        );
      })}
      {f >= b(3) && (() => {
        const MH = V ? 420 : 330, k = MH / M_VIEW.h;
        const a = ip(f, [b(3), b(3.4)], [0, 1]);
        const out = ip(f, [b(3.62), b(4)], [0, 1], inExpo);
        return (
          <div style={{ position: "absolute", left: CX, top: cy0, transform: `translate(-50%, -50%) scale(${1 - out * 0.8})`, opacity: 1 - out }}>
            <MLogo height={MH} piece={(i) => {
              const [cx, cy] = M_PIECES[i].c;
              const fx = row[i][0] / k - (cx - 255.5), fy = row[i][1] / k - (cy - 255.5);
              return { dx: fx * (1 - a), dy: fy * (1 - a), rot: (i % 2 ? -1 : 1) * 120 * (1 - a), s: 0.35 + 0.65 * a };
            }} />
          </div>
        );
      })()}
      {f >= b(3.55) && Array.from({ length: 199 }, (_, n) => {
        const cols = V ? 10 : 20, rows = V ? 20 : 10, sp = V ? 80 : 86;
        const cx = (n % cols) - (cols - 1) / 2, cy = Math.floor(n / cols) - (rows - 1) / 2;
        const d = Math.hypot(cx, cy);
        const on = ip(f, [b(3.55) + d * 1.25, b(3.55) + d * 1.25 + 7], [0, 1]);
        return <div key={n} style={{ position: "absolute", left: CX + cx * sp - 5, top: cy0 + cy * sp - 5, width: 10, height: 10, borderRadius: 5, background: n === 105 ? C.amber : C.ice, opacity: on * 0.9, transform: `scale(${on})` }} />;
      })}
    </AbsoluteFill>
  );
};

/* ============ 4. CAMERA (beats 16–20) : 3D fly-over of the bench, push into the lead ============ */
const CARD_W = 128, CARD_H = 76, PX = 150, PY = 100, COLS = 20;
const cardDisc: string[] = DISCIPLINES.flatMap(([n, c]) => Array(c).fill(n));
export const Camera: React.FC<{ f: number }> = ({ f }) => {
  const { V, W, CX, CY, M, BOT } = useL();
  const LEAD = 112; // the card we land on
  const lc = (LEAD % COLS) - (COLS - 1) / 2, lr = Math.floor(LEAD / COLS) - 4.5;
  const p = ip(f, [0, b(3.3)], [0, 1], inOut);
  const push = ip(f, [b(3.25), b(4)], [0, 1], inExpo);
  const z = (V ? -2600 : -2100) + (V ? 2700 : 2200) * p + 1150 * push;
  const rx = 62 * p * (1 - push * 0.9);
  const rz = (V ? -60 : -34) + (V ? 66 : 40) * p;
  const tx = lc * PX * p, ty = lr * PY * p;
  const flood = ip(f, [b(3.75), b(4) - 1], [0, 1], (x) => x);
  const word = f < b(2) ? "199 ROLES." : "ONE BENCH.";
  const wl = split(word, V), wSize = V ? fitLines(wl, 125, W - 2 * M, 300) : 190, wH = V ? wSize * 0.9 * wl.length + 40 : 240;
  const wf = f < b(2) ? f : f - b(2);
  return (
    <AbsoluteFill style={{ background: C.deep, perspective: 1300, overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: CX, top: CY, transformStyle: "preserve-3d",
        transform: `translateZ(${z}px) rotateX(${rx}deg) rotateZ(${rz}deg) translate(${-tx}px, ${-ty}px)`,
      }}>
        {cardDisc.map((d, n) => {
          const cx = (n % COLS) - (COLS - 1) / 2, cy = Math.floor(n / COLS) - 4.5;
          const lead = n === LEAD;
          const lit = !lead && ((n * 37) % 11 === 0) && f > (n % 7) * 10;
          return (
            <div key={n} style={{
              position: "absolute", left: cx * PX - CARD_W / 2, top: cy * PY - CARD_H / 2, width: CARD_W, height: CARD_H,
              border: `2px solid ${lead ? C.amber : lit ? C.coral : "rgba(228,237,243,0.45)"}`,
              background: lead ? C.amber : lit ? "rgba(232,119,94,0.18)" : "rgba(228,237,243,0.04)",
              padding: 8, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", color: lead ? C.navy : C.muted }}>{lead ? "YOUR LEAD" : d}</div>
              <div style={{ fontFamily: DISPLAY, fontVariationSettings: vf(110, 800), fontSize: 20, color: lead ? C.navy : C.ice }}>{String(n + 1).padStart(3, "0")}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: M, bottom: V ? BOT : 110, overflow: "hidden", height: wH, mixBlendMode: "difference" }}>
        <div style={{ transform: `translateY(${ip(wf, [0, 14], [wH, 0])}px)` }}>
          {wl.map((l, i) => <Txt key={i} w={125} size={wSize} color="transparent" style={{ WebkitTextStroke: `3px #ffffff` }}>{l}</Txt>)}
        </div>
      </div>
      <AbsoluteFill style={{ background: C.amber, opacity: flood }} />
    </AbsoluteFill>
  );
};

/* ============ 5. COLOUR (beats 20–24) : 8 services, a colour wipe per 8th ============ */
export const Colour: React.FC<{ f: number }> = ({ f }) => {
  const { V, W, H, CY, M, TOP, BOT } = useL();
  const ORIGINS = [[0, 0], [W, H], [W, 0], [0, H], [W / 2, 0], [W / 2, H], [0, H / 2], [W, H / 2]];
  const i = Math.min(7, Math.floor(f / WORD_LEN));
  const lf = f - i * WORD_LEN;
  const prev = i > 0 ? SERVICES[i - 1] : [null, null, C.amber, C.navy];
  const [name, price, bg, fg] = SERVICES[i];
  const r = ip(lf, [0, 8], [0, Math.hypot(W, H) * 1.05]);
  const [ox, oy] = ORIGINS[i];
  const w = ip(lf, [0, 10], [62, 112]);
  const words = split(name, V);
  const size = fitLines(words, 112, V ? W - 2 * M - 10 : 1740, 300);
  return (
    <AbsoluteFill style={{ background: prev[2] as string }}>
      <AbsoluteFill style={{ background: bg, clipPath: `circle(${r}px at ${ox}px ${oy}px)` }}>
        <div style={{ position: "absolute", left: V ? M : 90, top: CY, transform: `translate(${ip(lf, [0, 10], [70, 0])}px, -50%)` }}>
          <Lines lines={words} w={w} size={size} color={fg} />
        </div>
        <Mono size={40} color={fg} style={{ position: "absolute", right: V ? undefined : 96, left: V ? M : undefined, top: V ? TOP + 60 : 150, opacity: ip(lf, [3, 8], [0, 1]) }}>{price}</Mono>
        <Mono size={24} color={fg} style={{ position: "absolute", left: M, bottom: BOT }}>{String(i + 1).padStart(2, "0")} / 08 — published starting price</Mono>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============ 6. BUILD (beats 24–28) : 199 converge to one, RGB split stutter, silence ============ */
export const Build: React.FC<{ f: number }> = ({ f }) => {
  const { V, W, CX, CY } = useL();
  if (f >= b(3.5)) {
    const g = ip(f, [b(3.5), b(4)], [0, 1], inExpo);
    return <AbsoluteFill style={{ background: "#000", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 10 + g * 8, height: 10 + g * 8, borderRadius: 20, background: C.amber, boxShadow: `0 0 ${20 + g * 40}px ${C.amber}` }} />
    </AbsoluteFill>;
  }
  const R = ip(f, [0, b(3.5)], [470, 18], (x) => x * x * (3 - 2 * x));
  const spin = f * 0.012 + ip(f, [0, b(3.5)], [0, 2.4], inExpo);
  const word = f < b(1) ? "ONE BRIEF." : f < b(2) ? "ONE LEAD." : "ONE FIRM.";
  const wf = f % b(1);
  const st = f >= b(3);
  const p16 = st ? pulse(f - b(3), 4, 4) : 0;
  const sp = st ? 6 + (f - b(3)) * 1.4 : ip(wf, [0, 8], [18, 0]);
  const zoom = st ? ip(f, [b(3), b(3.5)], [1, 1.32], (x) => x) : 1;
  const [ex, ey] = V ? [0.95, 1.4] : [1.25, 1];
  return (
    <AbsoluteFill style={{ background: C.navy, transform: `scale(${zoom})` }}>
      {Array.from({ length: 199 }, (_, n) => {
        const a = (n / 199) * Math.PI * 2 + spin * (n % 2 ? 1 : 1.15);
        const rr = R * (1 + (n % 3) * 0.06);
        return <div key={n} style={{ position: "absolute", left: CX + Math.cos(a) * rr * ex - 4, top: CY + Math.sin(a) * rr * ey - 4, width: 8, height: 8, borderRadius: 4, background: n % 9 === 0 ? C.amber : C.ice, opacity: 0.85 }} />;
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${(st ? 1 + p16 * 0.16 : ip(wf, [0, 10], [1.25, 1]))})` }}>
        <div style={{ textShadow: `${sp}px 0 #FF3B5C, ${-sp}px 0 #2EE6FF` }}>
          <Lines lines={split(word, V)} w={V ? 105 : 125} size={V ? fitLines(split(word, V), 105, W - 160, 250) : 182} align="center" />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============ 7. LAND (beat 28 → end) : clean lockup ============ */
export const Land: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const { V } = useL();
  const flash = f < 8 ? 1 - f / 8 : 0;
  const w = 62 + 38 * spring({ frame: f - 2, fps, config: { damping: 11, stiffness: 120, mass: 0.7 } });
  const tag = ip(f, [b(0.9), b(0.9) + 18], [0, 1]);
  const url = ip(f, [b(1.4), b(1.4) + 18], [0, 1]);
  const line = ip(f, [b(1.7), b(1.7) + 22], [0, 1]);
  const svc = ip(f, [b(2.1), b(2.1) + 18], [0, 1]);
  const grid = ip(f, [6, 50], [0, 1]);
  const mark = (
    <MLogo height={V ? 250 : 150} piece={(i) => {
      const delay = [0, 2, 7, 1][i];
      const s = spring({ frame: f - delay, fps, config: i === 2 ? { damping: 9, stiffness: 140, mass: 0.8 } : { damping: 15, stiffness: 170 } });
      const from = [[-520, 260], [-260, -520], [520, -520], [520, 260]][i];
      return { dx: from[0] * (1 - s), dy: from[1] * (1 - s), rot: [-90, 60, -140, 90][i] * (1 - s), o: Math.min(1, s * 3) };
    }} />
  );
  const wordmark = (
    <div style={{ fontFamily: DISPLAY, fontSize: V ? 122 : 168, lineHeight: 1, color: C.ice, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
      <span style={{ fontVariationSettings: vf(w, 900) }}>MANY</span>
      <span style={{ fontVariationSettings: vf(w, 260) }}>WRIGHT</span>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <AbsoluteFill style={{
        opacity: grid * 0.35,
        backgroundImage: `linear-gradient(rgba(42,73,100,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(42,73,100,0.55) 1px, transparent 1px)`,
        backgroundSize: "60px 60px", backgroundPosition: "center",
      }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: V ? 120 : 0 }}>
        {V ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 56 }}>{mark}{wordmark}</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>{mark}{wordmark}</div>
        )}
        <div style={{ marginTop: V ? 52 : 44, opacity: tag, transform: `translateY(${(1 - tag) * 26}px)` }}>
          <Txt w={100} g={420} size={V ? 60 : 58} style={{ letterSpacing: "0" }}>Every specialist. One firm.</Txt>
        </div>
        <div style={{ marginTop: 40, opacity: url, transform: `translateY(${(1 - url) * 20}px)`, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: V ? 46 : 40, color: C.amber, letterSpacing: "0.04em" }}>manywright.com</div>
          <div style={{ height: 3, width: V ? 410 : 360, background: C.amber, transform: `scaleX(${line})`, marginTop: 10 }} />
        </div>
        {V ? (
          <div style={{ marginTop: 54, opacity: svc, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Mono size={24} color={C.muted}>Websites · Local search · Social</Mono>
            <Mono size={24} color={C.muted}>Books · Inbox · Security</Mono>
          </div>
        ) : (
          <Mono size={21} color={C.muted} style={{ marginTop: 54, opacity: svc }}>Websites · Local search · Social · Books · Inbox · Security</Mono>
        )}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};
