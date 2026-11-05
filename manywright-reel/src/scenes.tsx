import React from "react";
import { AbsoluteFill, spring } from "remotion";
import { b, BF, C, DISPLAY, fit, inExpo, inOut, ip, Mono, MONO, outExpo, pulse, Txt, vf } from "./lib";

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

/* ============ 1. HOOK  (beats 0–4) : slam type, colour invert, 16th stutter ============ */
export const Hook: React.FC<{ f: number }> = ({ f }) => {
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
  const spW = ip(f, [b(1), b(1) + 22], [62, 125]);
  const drift = ip(f, [b(2), b(3)], [0, 1], inOut);
  const bar = ip(f, [b(1) + 4, b(2)], [0, 1]);
  const p16 = stut ? pulse(f - b(3), 4, 5) : 0;
  return (
    <AbsoluteFill style={{ background: bg }}>
      {!stut && (
        <div style={{ position: "absolute", left: 96, top: 210 }}>
          <div style={{ transform: `translateX(${-60 * drift}px) scale(${evS})`, transformOrigin: "0% 60%", filter: `blur(${evBlur}px)` }}>
            <Txt w={125} g={900} size={372} color={fg}>EVERY</Txt>
          </div>
          <div style={{ overflow: "hidden", height: 200, marginTop: 10 }}>
            <div style={{ transform: `translate(${60 * drift}px, ${spY}%)` }}>
              <Txt w={spW} g={900} size={196} color={fg}>SPECIALIST<span style={{ color: acc }}>.</span></Txt>
            </div>
          </div>
          <div style={{ height: 14, width: 1500 * bar, background: acc, marginTop: 26 }} />
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
              <Txt w={125} g={900} size={236} color={fg}>ONE FIRM.</Txt>
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
  const [name, count] = DISCIPLINES[i];
  const t = i % 5;
  const label = (
    <Mono size={22} color={t === 2 || t === 4 ? C.navy : C.muted} style={{ position: "absolute", left: 96, bottom: 120 }}>
      {String(i + 1).padStart(2, "0")} / 13 — {name} — {count} {count === 1 ? "role" : "roles"}
    </Mono>
  );
  if (t === 0) {
    const w = ip(lf, [0, 12], [62, 125]);
    const size = fit(name, 125, 1720, 330);
    return (
      <AbsoluteFill style={{ background: C.navy, alignItems: "center", justifyContent: "center" }}>
        <Txt w={w} size={size} style={{ letterSpacing: `${ip(lf, [0, 12], [0.25, -0.01])}em` }}>{name}</Txt>
        <div style={{ position: "absolute", top: 540 + size * 0.5, height: 10, width: 1720 * ip(lf, [0, 12], [0, 1]), background: C.amber }} />
        {label}
      </AbsoluteFill>
    );
  }
  if (t === 1) {
    const size = fit(name, 110, 1720, 170);
    const scroll = ip(lf, [0, 14], [size * 0.9, 0]);
    return (
      <AbsoluteFill style={{ background: C.navy, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {[-3, -2, -1, 0, 1, 2, 3].map((r) => (
          <div key={r} style={{ position: "absolute", transform: `translateY(${r * size * 0.9 + scroll * (r === 0 ? 0 : 1)}px)` }}>
            <Txt w={110} size={size} color={r === 0 ? C.amber : "transparent"} style={{ WebkitTextStroke: r === 0 ? undefined : `2px ${C.ice}`, opacity: r === 0 ? 1 : 0.55 - Math.abs(r) * 0.1 }}>{name}</Txt>
          </div>
        ))}
        {label}
      </AbsoluteFill>
    );
  }
  if (t === 2) {
    const size = fit(name, 100, 1720, 300);
    return (
      <AbsoluteFill style={{ background: C.ice, alignItems: "center", justifyContent: "center" }}>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <div key={s} style={{
            position: "absolute", clipPath: `inset(${s * 16.66}% 0 ${100 - (s + 1) * 16.66}% 0)`,
            transform: `translateX(${(s % 2 ? 1 : -1) * ip(lf, [0, 11], [420 + s * 40, 0])}px)`,
          }}>
            <Txt w={100} size={size} color={C.navy}>{name}</Txt>
          </div>
        ))}
        {label}
      </AbsoluteFill>
    );
  }
  if (t === 3) {
    const size = Math.min(230, 1000 / (name.length * 0.55));
    return (
      <AbsoluteFill style={{ background: C.navy }}>
        <div style={{ position: "absolute", left: 1720, top: 540, transform: `translate(-50%, -50%) rotate(-90deg) translateX(${ip(lf, [0, 12], [-260, 0])}px)` }}>
          <Txt w={78} size={size} color={C.amber}>{name}</Txt>
        </div>
        <div style={{ position: "absolute", left: 96, top: 250, transform: `translateY(${ip(lf, [0, 10], [60, 0])}px)` }}>
          <Txt w={125} size={460} color={C.ice}>{count}</Txt>
          <Mono size={30} color={C.muted} style={{ marginTop: 30 }}>{count === 1 ? "specialist role" : "specialist roles"}</Mono>
        </div>
        {label}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: C.coral, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 120, transform: `translateX(${ip(lf, [0, 15], [260, -520], (x) => x)}px)` }}>
        <Txt w={125} size={820} color={C.navy}>{name}</Txt>
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
  const cStart = b(6.5);
  if (f < cStart) {
    const i = Math.min(12, Math.floor(f / WORD_LEN));
    return <Discipline i={i} lf={f - i * WORD_LEN} />;
  }
  const lf = f - cStart;
  return (
    <AbsoluteFill style={{ background: C.navy, justifyContent: "center", paddingLeft: 96 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 9, 9].map((d, i) => <Roller key={i} digit={d} land={14 + i * 7} f={lf} size={470} />)}
      </div>
      <div style={{ marginTop: 34, opacity: ip(lf, [10, 22], [0, 1]), transform: `translateY(${ip(lf, [10, 22], [24, 0])}px)` }}>
        <Txt w={125} size={96} color={C.ice}>SPECIALIST ROLES</Txt>
        <Mono size={28} color={C.muted} style={{ marginTop: 18 }}>13 disciplines · one bench · one firm</Mono>
      </div>
    </AbsoluteFill>
  );
};

/* ============ 3. SHAPES (beats 12–16) : four pieces assemble, rotate, morph, multiply ============ */
export const Shapes: React.FC<{ f: number }> = ({ f }) => {
  const S = 210;
  const home = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => [x * S / 2, y * S / 2]);
  const from = [[-1200, -760], [1200, -760], [-1200, 760], [1200, 760]];
  const row = [-1.5, -0.5, 0.5, 1.5].map((x) => [x * 330, -20]);
  const names = ["BRIEF", "PROPOSE", "MAKE", "DELIVER"];
  const rot = ip(f, [b(0.5), b(1)], [0, 45]);
  const toRow = ip(f, [b(1), b(1.6)], [0, 1]);
  const toDots = ip(f, [b(3), b(3.4)], [0, 1], inExpo);
  const headline = f < b(2) ? "FOUR PIECES." : "ONE WAY OF WORKING.";
  const hf = f < b(2) ? f : f - b(2);
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <div style={{ position: "absolute", left: 96, top: 110, overflow: "hidden", height: 110 }}>
        <div style={{ transform: `translateY(${ip(hf, [0, 12], [110, 0])}px)` }}>
          <Txt w={112} g={850} size={104}>{headline}</Txt>
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
        const size = S * (1 - toRow * 0.15) * (1 + bounce * 0.28) * (1 - toDots * 0.96);
        const r = ip(f, [b(1), b(1.6)], [0, 50]);
        const spin = (1 - a) * 220 + rot * (1 - toRow);
        return (
          <React.Fragment key={i}>
            <div style={{
              position: "absolute", left: 960 + x - size / 2, top: 560 + y - size / 2, width: size, height: size,
              background: col, borderRadius: `${r}%`, transform: `rotate(${spin}deg)`,
              boxShadow: i === 3 ? "none" : undefined,
            }} />
            {f >= hit && toDots < 0.5 && (
              <Mono size={30} color={col} style={{ position: "absolute", left: 960 + row[i][0], top: 720, transform: `translate(-50%, ${ip(f - hit, [0, 10], [20, 0])}px)`, opacity: ip(f - hit, [0, 6], [0, 1]) }}>
                0{i + 1} {names[i]}
              </Mono>
            )}
          </React.Fragment>
        );
      })}
      {f >= b(3.2) && Array.from({ length: 199 }, (_, n) => {
        const cx = (n % 20) - 9.5, cy = Math.floor(n / 20) - 4.5;
        const d = Math.hypot(cx, cy);
        const on = ip(f, [b(3.2) + d * 2.2, b(3.2) + d * 2.2 + 8], [0, 1]);
        return <div key={n} style={{ position: "absolute", left: 960 + cx * 86 - 5, top: 560 + cy * 86 - 5, width: 10, height: 10, borderRadius: 5, background: n === 105 ? C.amber : C.ice, opacity: on * 0.9, transform: `scale(${on})` }} />;
      })}
    </AbsoluteFill>
  );
};

/* ============ 4. CAMERA (beats 16–20) : 3D fly-over of the bench, push into the lead ============ */
const CARD_W = 128, CARD_H = 76, PX = 150, PY = 100, COLS = 20;
const cardDisc: string[] = DISCIPLINES.flatMap(([n, c]) => Array(c).fill(n));
export const Camera: React.FC<{ f: number }> = ({ f }) => {
  const LEAD = 112; // the card we land on
  const lc = (LEAD % COLS) - (COLS - 1) / 2, lr = Math.floor(LEAD / COLS) - 4.5;
  const p = ip(f, [0, b(3.3)], [0, 1], inOut);
  const push = ip(f, [b(3.25), b(4)], [0, 1], inExpo);
  const z = -2100 + 2200 * p + 1150 * push;
  const rx = 62 * p * (1 - push * 0.9);
  const rz = -34 + 40 * p;
  const tx = lc * PX * p, ty = lr * PY * p;
  const flood = ip(f, [b(3.75), b(4) - 1], [0, 1], (x) => x);
  const word = f < b(2) ? "199 ROLES." : "ONE BENCH.";
  const wf = f < b(2) ? f : f - b(2);
  return (
    <AbsoluteFill style={{ background: C.deep, perspective: 1300, overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: 960, top: 540, transformStyle: "preserve-3d",
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
      <div style={{ position: "absolute", left: 96, bottom: 110, overflow: "hidden", height: 240, mixBlendMode: "difference" }}>
        <div style={{ transform: `translateY(${ip(wf, [0, 14], [240, 0])}px)` }}>
          <Txt w={125} size={190} color="transparent" style={{ WebkitTextStroke: `3px #ffffff` }}>{word}</Txt>
        </div>
      </div>
      <AbsoluteFill style={{ background: C.amber, opacity: flood }} />
    </AbsoluteFill>
  );
};

/* ============ 5. COLOUR (beats 20–24) : 8 services, a colour wipe per 8th ============ */
const ORIGINS = [[0, 0], [1920, 1080], [1920, 0], [0, 1080], [960, 0], [960, 1080], [0, 540], [1920, 540]];
export const Colour: React.FC<{ f: number }> = ({ f }) => {
  const i = Math.min(7, Math.floor(f / WORD_LEN));
  const lf = f - i * WORD_LEN;
  const prev = i > 0 ? SERVICES[i - 1] : [null, null, C.amber, C.navy];
  const [name, price, bg, fg] = SERVICES[i];
  const r = ip(lf, [0, 8], [0, 2300]);
  const [ox, oy] = ORIGINS[i];
  const w = ip(lf, [0, 10], [62, 112]);
  const size = fit(name, 112, 1740, 300);
  return (
    <AbsoluteFill style={{ background: prev[2] as string }}>
      <AbsoluteFill style={{ background: bg, clipPath: `circle(${r}px at ${ox}px ${oy}px)` }}>
        <div style={{ position: "absolute", left: 90, top: 540, transform: `translate(${ip(lf, [0, 10], [70, 0])}px, -50%)` }}>
          <Txt w={w} size={size} color={fg}>{name}</Txt>
        </div>
        <Mono size={40} color={fg} style={{ position: "absolute", right: 96, top: 150, opacity: ip(lf, [3, 8], [0, 1]) }}>{price}</Mono>
        <Mono size={24} color={fg} style={{ position: "absolute", left: 96, bottom: 120 }}>{String(i + 1).padStart(2, "0")} / 08 — published starting price</Mono>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============ 6. BUILD (beats 24–28) : 199 converge to one, RGB split stutter, silence ============ */
export const Build: React.FC<{ f: number }> = ({ f }) => {
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
  const split = st ? 6 + (f - b(3)) * 1.4 : ip(wf, [0, 8], [18, 0]);
  const zoom = st ? ip(f, [b(3), b(3.5)], [1, 1.32], (x) => x) : 1;
  return (
    <AbsoluteFill style={{ background: C.navy, transform: `scale(${zoom})` }}>
      {Array.from({ length: 199 }, (_, n) => {
        const a = (n / 199) * Math.PI * 2 + spin * (n % 2 ? 1 : 1.15);
        const rr = R * (1 + (n % 3) * 0.06);
        return <div key={n} style={{ position: "absolute", left: 960 + Math.cos(a) * rr * 1.25 - 4, top: 540 + Math.sin(a) * rr - 4, width: 8, height: 8, borderRadius: 4, background: n % 9 === 0 ? C.amber : C.ice, opacity: 0.85 }} />;
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${(st ? 1 + p16 * 0.16 : ip(wf, [0, 10], [1.25, 1]))})` }}>
        <Txt w={125} size={182} color={C.ice} style={{ textShadow: `${split}px 0 #FF3B5C, ${-split}px 0 #2EE6FF` }}>{word}</Txt>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============ 7. LAND (beat 28 → end) : clean lockup ============ */
export const Land: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const flash = f < 8 ? 1 - f / 8 : 0;
  const w = 62 + 38 * spring({ frame: f - 2, fps, config: { damping: 11, stiffness: 120, mass: 0.7 } });
  const tag = ip(f, [b(0.9), b(0.9) + 18], [0, 1]);
  const url = ip(f, [b(1.4), b(1.4) + 18], [0, 1]);
  const line = ip(f, [b(1.7), b(1.7) + 22], [0, 1]);
  const svc = ip(f, [b(2.1), b(2.1) + 18], [0, 1]);
  const grid = ip(f, [6, 50], [0, 1]);
  const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <AbsoluteFill style={{
        opacity: grid * 0.35,
        backgroundImage: `linear-gradient(rgba(42,73,100,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(42,73,100,0.55) 1px, transparent 1px)`,
        backgroundSize: "60px 60px", backgroundPosition: "center",
      }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ position: "relative", width: 112, height: 112 }}>
            {PIECES.map((col, i) => {
              const s = spring({ frame: f - i * 2, fps, config: { damping: 14, stiffness: 160 } });
              return <div key={i} style={{
                position: "absolute", width: 52, height: 52, background: col,
                left: (i % 2) * 60 + dirs[i][0] * 300 * (1 - s), top: Math.floor(i / 2) * 60 + dirs[i][1] * 300 * (1 - s),
                transform: `rotate(${(1 - s) * 180}deg)`,
              }} />;
            })}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 168, lineHeight: 1, color: C.ice, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
            <span style={{ fontVariationSettings: vf(w, 900) }}>MANY</span>
            <span style={{ fontVariationSettings: vf(w, 260) }}>WRIGHT</span>
          </div>
        </div>
        <div style={{ marginTop: 44, opacity: tag, transform: `translateY(${(1 - tag) * 26}px)` }}>
          <Txt w={100} g={420} size={58} style={{ letterSpacing: "0" }}>Every specialist. One firm.</Txt>
        </div>
        <div style={{ marginTop: 40, opacity: url, transform: `translateY(${(1 - url) * 20}px)`, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 40, color: C.amber, letterSpacing: "0.04em" }}>manywright.com</div>
          <div style={{ height: 3, width: 360, background: C.amber, transform: `scaleX(${line})`, marginTop: 10 }} />
        </div>
        <Mono size={21} color={C.muted} style={{ marginTop: 54, opacity: svc }}>Websites · Local search · Social · Books · Inbox · Security</Mono>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};
