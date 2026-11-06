import React from "react";
import { AbsoluteFill, random } from "remotion";
import { b, BF, ip, inOut, useL } from "../lib";

// ---- Act I palette: paper, ink, red pencil
export const V = {
  paper: "#EADFC4", paper2: "#E0D0AB", ink: "#2B1E12", sepia: "#6B4B2E", faded: "#8A7356", red: "#B5372B", cream: "#F2E8D2", leader: "#8C7C63",
};
// film gate width each side: 4:3 inside 16:9, or a slim strip in portrait
export const gateW = (V: boolean) => (V ? 110 : 240);
export const SERIF = "'Abril Fatface', Georgia, serif";
export const TYPE = "'Special Elite', 'Courier New', monospace";
const mixHex = (a: string, c: string, t: number) => {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(c, i) - p(a, i)) * t)).join(",")})`;
};

/* ---------- 1. film leader countdown, then a title card ---------- */
export const Countdown: React.FC<{ f: number }> = ({ f }) => {
  const { V: P, W, H } = useL();
  if (f >= b(3)) {
    const lf = f - b(3), burn = Math.max(0, 1 - lf / 6);
    return (
      <AbsoluteFill style={{ background: "#120c06", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: SERIF, fontSize: P ? 104 : 150, color: V.cream, letterSpacing: "0.08em", opacity: ip(lf, [0, 4], [0, 1]) }}>MANYWRIGHT</div>
        <div style={{ fontFamily: TYPE, fontSize: P ? 34 : 40, color: V.cream, letterSpacing: "0.5em", marginTop: 10, opacity: ip(lf, [3, 8], [0, 1]) }}>PRESENTS</div>
        <AbsoluteFill style={{ background: "#fff6e0", opacity: burn }} />
      </AbsoluteFill>
    );
  }
  const n = f < b(1) ? 3 : f < b(2) ? 2 : 1;
  const sweep = ((f % BF) / BF) * 360;
  const pop = 1 + Math.max(0, 1 - (f % BF) / 6) * 0.08;
  return (
    <AbsoluteFill style={{ background: V.leader, alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: P ? 820 : 900, height: P ? 820 : 900, borderRadius: "50%", background: `conic-gradient(rgba(20,12,4,0.38) 0deg ${sweep}deg, transparent ${sweep}deg 360deg)` }} />
      {(P ? [380, 315] : [400, 330]).map((r) => <div key={r} style={{ position: "absolute", width: r * 2, height: r * 2, borderRadius: "50%", border: `7px solid ${V.cream}` }} />)}
      <div style={{ position: "absolute", width: W - 2 * gateW(P), height: 5, background: V.cream, opacity: 0.85 }} />
      <div style={{ position: "absolute", width: 5, height: H, background: V.cream, opacity: 0.85 }} />
      <div style={{ fontFamily: SERIF, fontSize: 560, lineHeight: 1, color: V.cream, transform: `scale(${pop})`, textShadow: "0 0 30px rgba(0,0,0,0.25)" }}>{n}</div>
    </AbsoluteFill>
  );
};

/* ---------- typed intertitle band ---------- */
const Intertitle: React.FC<{ text: string; f: number; start: number }> = ({ text, f, start }) => {
  const { V: P, W } = useL();
  const n = Math.max(0, Math.floor((f - start) / b(0.06)));
  const blink = Math.floor(f / 10) % 2 === 0;
  const g = gateW(P);
  return (
    <div style={{ position: "absolute", left: g, width: W - 2 * g, bottom: P ? 340 : 0, height: P ? 230 : 150, background: "rgba(18,12,6,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: TYPE, fontSize: P ? 48 : 46, color: V.cream, letterSpacing: "0.02em", whiteSpace: P ? "normal" : "pre", textAlign: "center", maxWidth: P ? 760 : undefined, lineHeight: 1.3 }}>
        {text.slice(0, n)}<span style={{ opacity: n < text.length || blink ? 1 : 0 }}>▌</span><span style={{ color: "transparent" }}>{text.slice(n)}</span>
      </div>
    </div>
  );
};

/* ---------- 2. the phone book ---------- */
const COL1 = ["ACE PLUMBING", "ALLIED PIPE & DRAIN", "BAYSIDE PLUMBERS", "BEST BATH CO.", "CITY PLUMBING", "DOWNTOWN DRAINS", "EAGLE PLUMBING", "FIRST CALL PIPES", "GARDEN ROUTE TAPS"];
const COL2 = ["HARBOUR PLUMBING", "KNYSNA PIPEWORKS", "LAKESIDE DRAINS", "MAIN ST. PLUMBERS", "YOUR BUSINESS", "OCEAN VIEW PIPES", "PIONEER PLUMBING", "QUICK FIX DRAINS", "RELIABLE PLUMBERS"];
const Listing: React.FC<{ name: string; n: number; hot?: boolean }> = ({ name, n, hot }) => (
  <div style={{ display: "flex", fontFamily: TYPE, fontSize: 27, color: hot ? V.ink : V.sepia, height: 46, alignItems: "center", fontWeight: hot ? 700 : 400 }}>
    <span>{name}</span>
    <span style={{ flex: 1, borderBottom: `3px dotted ${V.faded}`, margin: "0 12px 8px", opacity: 0.7 }} />
    <span>555-01{String(n).padStart(2, "0")}</span>
  </div>
);
const PORTRAIT_LIST = [...COL1.slice(0, 6), "KNYSNA PIPEWORKS", "LAKESIDE DRAINS", "MAIN ST. PLUMBERS", "YOUR BUSINESS", "OCEAN VIEW PIPES", "PIONEER PLUMBING", "QUICK FIX DRAINS"];
export const PhoneBook: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  const push = ip(f, [0, b(4)], [1, 1.09], inOut);
  const draw = ip(f, [b(2.3), b(3.5)], [0, 1]);
  if (P) return (
    <AbsoluteFill style={{ background: V.paper }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: "540px 1010px" }}>
        <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(0deg, rgba(107,75,46,0.05) 0 2px, transparent 2px 7px)` }} />
        <div style={{ position: "absolute", left: 150, right: 150, top: 270, borderBottom: `5px double ${V.sepia}`, paddingBottom: 14 }}>
          <div style={{ fontFamily: SERIF, fontSize: 74, color: V.ink, lineHeight: 1.05 }}>Telephone Directory</div>
          <div style={{ fontFamily: TYPE, fontSize: 28, color: V.sepia, marginTop: 10 }}>1975 EDITION · P. 214</div>
        </div>
        <div style={{ position: "absolute", top: 490, left: 150, width: 780 }}>
          <div style={{ fontFamily: SERIF, fontSize: 50, color: V.ink, marginBottom: 16 }}>Plumbers</div>
          {PORTRAIT_LIST.map((nm, k) => (
            <div key={nm} style={{ display: "flex", fontFamily: TYPE, fontSize: 30, color: nm === "YOUR BUSINESS" ? V.ink : V.sepia, height: 52, alignItems: "center", fontWeight: nm === "YOUR BUSINESS" ? 700 : 400 }}>
              <span>{nm}</span><span style={{ flex: 1, borderBottom: `3px dotted ${V.faded}`, margin: "0 12px 8px", opacity: 0.7 }} /><span>555-01{String(k + 11).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
        <svg width="1080" height="1920" style={{ position: "absolute", inset: 0 }}>
          <path d="M 150 1042 C 155 1000, 520 990, 900 1004 C 960 1010, 966 1066, 900 1082 C 600 1110, 260 1106, 160 1080 C 120 1066, 130 1028, 200 1016"
            fill="none" stroke={V.red} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} style={{ filter: "url(#rough)" }} />
          <defs><filter id="rough"><feTurbulence baseFrequency="0.9" numOctaves="1" seed="3" /><feDisplacementMap in="SourceGraphic" scale="3" /></filter></defs>
        </svg>
      </AbsoluteFill>
      <Intertitle text="ONCE, THEY FOUND YOU IN THE PHONE BOOK." f={f} start={b(0.3)} />
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill style={{ background: V.paper }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: "1150px 490px" }}>
        <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(0deg, rgba(107,75,46,0.05) 0 2px, transparent 2px 7px)` }} />
        <div style={{ position: "absolute", left: 330, right: 330, top: 70, display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `5px double ${V.sepia}`, paddingBottom: 14 }}>
          <div style={{ fontFamily: SERIF, fontSize: 70, color: V.ink }}>Telephone Directory</div>
          <div style={{ fontFamily: TYPE, fontSize: 28, color: V.sepia }}>1975 EDITION · P. 214</div>
        </div>
        {[COL1, COL2].map((col, c) => (
          <div key={c} style={{ position: "absolute", top: 210, left: c ? 1000 : 330, width: 600 }}>
            <div style={{ fontFamily: SERIF, fontSize: 46, color: V.ink, marginBottom: 14 }}>{c ? "Plumbers (cont.)" : "Plumbers"}</div>
            {col.map((nm, k) => <Listing key={nm} name={nm} n={c * 9 + k + 11} hot={nm === "YOUR BUSINESS"} />)}
          </div>
        ))}
        <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
          <path d="M 975 492 C 980 450, 1300 442, 1560 456 C 1660 462, 1668 518, 1580 534 C 1360 562, 1060 558, 985 530 C 948 516, 960 480, 1020 468"
            fill="none" stroke={V.red} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} style={{ filter: "url(#rough)" }} />
          <defs><filter id="rough"><feTurbulence baseFrequency="0.9" numOctaves="1" seed="3" /><feDisplacementMap in="SourceGraphic" scale="3" /></filter></defs>
        </svg>
      </AbsoluteFill>
      <Intertitle text="ONCE, THEY FOUND YOU IN THE PHONE BOOK." f={f} start={b(0.3)} />
    </AbsoluteFill>
  );
};

/* ---------- 3. the paper map ---------- */
export const PaperMap: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  const pan = ip(f, [0, b(4)], [0, 1], inOut);
  const route = ip(f, [b(1.6), b(3.2)], [0, 1]);
  const pin = ip(f, [b(3.0), b(3.4)], [0, 1]);
  if (P) {
    const st: string[] = [];
    for (let k = 0; k < 6; k++) st.push(`M ${170 + k * 150 + (k % 2) * 8} 220 L ${164 + k * 150 - (k % 3) * 8} 1720`);
    for (let k = 0; k < 9; k++) st.push(`M 120 ${280 + k * 170} L 960 ${288 + k * 170 + (k % 2) * 12}`);
    const R = "M 260 1290 L 260 1060 L 620 1060 L 620 700 L 780 700";
    return (
      <AbsoluteFill style={{ background: V.paper2 }}>
        <AbsoluteFill style={{ transform: `translateY(${-60 * pan}px) scale(${1.04 + 0.1 * pan})`, transformOrigin: "700px 900px" }}>
          <svg width="1080" height="1920">
            <defs><filter id="ink"><feTurbulence baseFrequency="0.7" numOctaves="1" seed="9" /><feDisplacementMap in="SourceGraphic" scale="2.5" /></filter></defs>
            <g filter="url(#ink)">
              <path d="M 110 1180 C 300 1100, 420 1260, 620 1200 S 900 1080, 980 1130" fill="none" stroke="#7d8a8f" strokeWidth={46} opacity={0.35} />
              {st.map((d, k) => <path key={k} d={d} stroke={V.sepia} strokeWidth={k % 4 === 0 ? 7 : 3} fill="none" opacity={0.75} />)}
              {Array.from({ length: 15 }, (_, k) => <rect key={k} x={190 + (k % 3) * 260 + random(`pbx${k}`) * 40} y={320 + Math.floor(k / 3) * 250 + random(`pby${k}`) * 30} width={70 + random(`pbw${k}`) * 60} height={50 + random(`pbh${k}`) * 40} fill={V.sepia} opacity={0.12} />)}
              <g transform="translate(840 420)">
                <circle r="70" fill="none" stroke={V.ink} strokeWidth="3" />
                <path d="M 0 -90 L 14 0 L 0 90 L -14 0 Z" fill={V.ink} opacity={0.8} />
                <path d="M -90 0 L 0 14 L 90 0 L 0 -14 Z" fill={V.ink} opacity={0.45} />
                <text x="0" y="-102" textAnchor="middle" fontFamily={TYPE} fontSize="30" fill={V.ink}>N</text>
              </g>
            </g>
            {[["MAIN ST.", 190, 520], ["HARBOUR RD.", 470, 860], ["MARKET SQ.", 300, 990], ["LAGOON", 660, 1260]].map(([t, x, y]) => (
              <text key={t as string} x={x as number} y={y as number} fontFamily={TYPE} fontSize="28" fill={V.ink} opacity={0.8}>{t}</text>
            ))}
            <text x="200" y="1330" fontFamily={TYPE} fontSize="28" fill={V.red}>YOU ARE HERE ×</text>
            <path d={R} fill="none" stroke={V.red} strokeWidth={8} strokeDasharray="22 16" />
            <g transform={`translate(780 700) scale(${pin})`}>
              <path d="M 0 0 C -40 -50, -40 -100, 0 -100 C 40 -100, 40 -50, 0 0 Z" fill={V.red} />
              <circle cy="-68" r="13" fill={V.paper2} />
            </g>
            <text x="560" y="560" fontFamily={SERIF} fontSize="44" fill={V.ink} opacity={pin}>Your Business</text>
          </svg>
          <svg width="1080" height="1920" style={{ position: "absolute", inset: 0 }}>
            <path d="M 780 700 L 620 700 L 620 1060 L 260 1060 L 260 1290" fill="none" stroke={V.paper2} strokeWidth={16} pathLength={1} strokeDasharray={1} strokeDashoffset={route} strokeLinecap="square" />
          </svg>
        </AbsoluteFill>
        <Intertitle text="THEN THEY ASKED FOR DIRECTIONS." f={f} start={b(0.3)} />
      </AbsoluteFill>
    );
  }
  const streets: string[] = [];
  for (let k = 0; k < 9; k++) streets.push(`M ${300 + k * 160 + (k % 2) * 8} 120 L ${290 + k * 160 - (k % 3) * 10} 980`);
  for (let k = 0; k < 6; k++) streets.push(`M 260 ${180 + k * 150} L 1680 ${190 + k * 150 + (k % 2) * 14}`);
  return (
    <AbsoluteFill style={{ background: V.paper2 }}>
      <AbsoluteFill style={{ transform: `translateX(${-70 * pan}px) scale(${1.04 + 0.1 * pan})`, transformOrigin: "1180px 400px" }}>
        <svg width="1920" height="1080">
          <defs><filter id="ink"><feTurbulence baseFrequency="0.7" numOctaves="1" seed="9" /><feDisplacementMap in="SourceGraphic" scale="2.5" /></filter></defs>
          <g filter="url(#ink)">
            <path d="M 240 820 C 520 760, 640 900, 900 860 S 1380 700, 1700 760" fill="none" stroke="#7d8a8f" strokeWidth={46} opacity={0.35} />
            {streets.map((d, k) => <path key={k} d={d} stroke={V.sepia} strokeWidth={k % 4 === 0 ? 7 : 3} fill="none" opacity={0.75} />)}
            {Array.from({ length: 18 }, (_, k) => <rect key={k} x={320 + (k % 6) * 230 + random(`bx${k}`) * 40} y={210 + Math.floor(k / 6) * 230 + random(`by${k}`) * 30} width={70 + random(`bw${k}`) * 60} height={50 + random(`bh${k}`) * 40} fill={V.sepia} opacity={0.12} />)}
            {/* compass rose */}
            <g transform="translate(1520 230)">
              <circle r="70" fill="none" stroke={V.ink} strokeWidth="3" />
              <path d="M 0 -90 L 14 0 L 0 90 L -14 0 Z" fill={V.ink} opacity={0.8} />
              <path d="M -90 0 L 0 14 L 90 0 L 0 -14 Z" fill={V.ink} opacity={0.45} />
              <text x="0" y="-102" textAnchor="middle" fontFamily={TYPE} fontSize="30" fill={V.ink}>N</text>
            </g>
          </g>
          {[["MAIN ST.", 560, 345], ["HARBOUR RD.", 980, 495], ["MARKET SQ.", 760, 640], ["LAGOON", 1240, 790]].map(([t, x, y]) => (
            <text key={t as string} x={x as number} y={y as number} fontFamily={TYPE} fontSize="26" fill={V.ink} opacity={0.8}>{t}</text>
          ))}
          <text x="330" y="930" fontFamily={TYPE} fontSize="26" fill={V.red}>YOU ARE HERE ×</text>
          <path d="M 520 920 L 520 650 L 1010 650 L 1010 360 L 1300 360" fill="none" stroke={V.red} strokeWidth={8} strokeDasharray="22 16" />
          <g transform={`translate(1300 360) scale(${pin})`}>
            <path d="M 0 0 C -40 -50, -40 -100, 0 -100 C 40 -100, 40 -50, 0 0 Z" fill={V.red} />
            <circle cy="-68" r="13" fill={V.paper2} />
          </g>
          <text x="1350" y="300" fontFamily={SERIF} fontSize="40" fill={V.ink} opacity={pin}>Your Business</text>
        </svg>
        {/* route cover: a paper-coloured stroke that retracts as the route is drawn */}
        <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
          <path d="M 1300 360 L 1010 360 L 1010 650 L 520 650 L 520 920" fill="none" stroke={V.paper2} strokeWidth={16} pathLength={1} strokeDasharray={1} strokeDashoffset={route} strokeLinecap="square" />
        </svg>
      </AbsoluteFill>
      <Intertitle text="THEN THEY ASKED FOR DIRECTIONS." f={f} start={b(0.3)} />
    </AbsoluteFill>
  );
};

/* ---------- 4. the turn: a search bar, as the era changes ---------- */
export const SearchTurn: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  const dark = ip(f, [b(1.6), b(3.6)], [0, 1], inOut);
  const bg = mixHex(V.paper2, "#050A14", dark);
  const fg = mixHex(V.ink, "#F4F6FA", dark);
  const q = "plumber near me";
  const n = Math.max(0, Math.floor((f - b(0.6)) / b(0.075)));
  const typed = q.slice(0, n);
  const head = "TODAY, THEY SEARCH:";
  const hn = Math.max(0, Math.floor(f / b(0.03)));
  const glow = ip(f, [b(2), b(3)], [0, 1]);
  const zoom = ip(f, [b(3.3), b(4)], [1, 2.4], (x) => x * x * x);
  const blink = Math.floor(f / 12) % 2 === 0;
  const sugg = ip(f, [b(2.2), b(2.8)], [0, 1]);
  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: `scale(${zoom})`, display: "flex", flexDirection: "column", alignItems: "center", opacity: 1 - ip(f, [b(3.75), b(4)], [0, 1]) }}>
        <div style={{ fontFamily: dark < 0.5 ? SERIF : "'Archivo', sans-serif", fontVariationSettings: "'wdth' 125, 'wght' 800", fontSize: P ? 96 : 76, color: fg, letterSpacing: dark < 0.5 ? "0.02em" : "0.04em", marginBottom: 46, textAlign: "center", lineHeight: 1.05, whiteSpace: "pre" }}>{(P ? "TODAY,\nTHEY SEARCH:" : head).slice(0, hn + (P && hn > 6 ? 1 : 0))}</div>
        <div style={{
          width: P ? 960 : 1180, height: 128, borderRadius: 64, display: "flex", alignItems: "center", gap: 28, padding: "0 46px", boxSizing: "border-box",
          background: dark < 0.5 ? "rgba(255,250,235,0.6)" : `rgba(20,36,60,${0.5 + 0.3 * glow})`,
          border: `3px solid ${dark < 0.5 ? V.sepia : `rgba(46,230,255,${0.4 + 0.6 * glow})`}`,
          boxShadow: `0 0 ${60 * glow}px rgba(46,230,255,${0.55 * glow}), inset 0 0 ${30 * glow}px rgba(46,230,255,${0.2 * glow})`,
        }}>
          <svg width="52" height="52" viewBox="0 0 52 52"><circle cx="21" cy="21" r="15" fill="none" stroke={fg} strokeWidth="5" /><path d="M 32 32 L 47 47" stroke={fg} strokeWidth="6" strokeLinecap="round" /></svg>
          <div style={{ fontFamily: "'Archivo', sans-serif", fontVariationSettings: "'wdth' 100, 'wght' 500", fontSize: P ? 56 : 60, color: fg, whiteSpace: "pre" }}>
            {typed.slice(0, 8)}<span style={{ color: "#F5A524" }}>{typed.slice(8)}</span><span style={{ opacity: blink ? 1 : 0, color: "#2EE6FF" }}>|</span>
          </div>
        </div>
        <div style={{ width: P ? 900 : 1100, marginTop: 14, opacity: sugg }}>
          {["plumber near me open now", "plumber near me reviews", "plumber near me directions"].map((s, k) => (
            <div key={s} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, color: "rgba(244,246,250,0.6)", padding: "12px 30px", transform: `translateY(${(1 - sugg) * (10 + k * 8)}px)` }}>⌕ {s}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- film treatment for Act I: grain, flicker, scratches, dust, vignette ---------- */
export const FilmLook: React.FC<{ f: number; amount: number }> = ({ f, amount }) => {
  const { V: P, W, H } = useL();
  if (amount <= 0.01) return null;
  const g = gateW(P);
  const flicker = 0.06 + random(`fl${Math.floor(f / 2)}`) * 0.08;
  const scratches = [0, 1, 2].filter((k) => random(`s${k}${Math.floor(f / 3)}`) > 0.55);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: amount }}>
      <AbsoluteFill style={{ background: "#000", opacity: flicker }} />
      <AbsoluteFill style={{ mixBlendMode: "overlay", opacity: 0.55 }}>
        <svg width={W} height={H}><filter id="fg"><feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed={f % 24} /></filter><rect width="100%" height="100%" filter="url(#fg)" /></svg>
      </AbsoluteFill>
      {scratches.map((k) => <div key={k} style={{ position: "absolute", top: 0, bottom: 0, left: g + 60 + random(`sx${k}${Math.floor(f / 3)}`) * (W - 2 * g - 120), width: 2, background: "rgba(255,248,230,0.55)" }} />)}
      {Array.from({ length: 6 }, (_, k) => random(`d${k}${f}`) > 0.6 && (
        <div key={k} style={{ position: "absolute", left: g + 20 + random(`dx${k}${f}`) * (W - 2 * g - 40), top: random(`dy${k}${f}`) * H, width: 3 + random(`dw${k}${f}`) * 7, height: 3 + random(`dh${k}${f}`) * 7, borderRadius: "50%", background: "rgba(20,12,4,0.7)" }} />
      ))}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(20,10,0,0.75) 100%)" }} />
    </AbsoluteFill>
  );
};

/* ---------- 4:3 film gate with running sprockets; opens to 16:9 at the turn ---------- */
export const FilmGate: React.FC<{ f: number; open: number }> = ({ f, open }) => {
  const { V: P } = useL();
  if (open >= 0.999) return null;
  const g = gateW(P), pitch = P ? 70 : 96, hw = P ? 46 : 70, hh = P ? 34 : 50, inset = P ? 32 : 70;
  const off = (f * 24) % pitch;
  const bar = (side: "left" | "right") => (
    <div style={{ position: "absolute", top: 0, bottom: 0, [side]: 0, width: g, background: "#0b0805", transform: `translateX(${(side === "left" ? -1 : 1) * g * open}px)`, overflow: "hidden" }}>
      {Array.from({ length: P ? 30 : 14 }, (_, k) => (
        <div key={k} style={{ position: "absolute", [side === "left" ? "left" : "right"]: inset, top: k * pitch - off, width: hw, height: hh, borderRadius: 10, background: "#3a2f22" }} />
      ))}
    </div>
  );
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{bar("left")}{bar("right")}</AbsoluteFill>;
};

/* ---------- year odometer: 1975 → 2026 across the turn ---------- */
export const Year: React.FC<{ f: number }> = ({ f }) => {
  const { V: P } = useL();
  const t = ip(f, [b(14), b(15.6)], [0, 1], inOut);
  const year = Math.round(1975 + (2026 - 1975) * t);
  const modern = t > 0.5;
  return (
    <div style={{ position: "absolute", left: modern ? 40 : P ? 140 : 280, top: P ? (modern ? 150 : 178) : modern ? 34 : 14, fontFamily: modern ? "'JetBrains Mono', monospace" : TYPE, fontSize: modern ? 22 : 42, color: modern ? "#2EE6FF" : V.cream, letterSpacing: "0.12em", opacity: 0.9, transition: "none" }}>
      {modern ? `YEAR ${year}` : year}
    </div>
  );
};
