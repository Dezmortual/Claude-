import React from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { b, ip } from "../lib";
import { City, F, Features, Honest, Hud, Land, Packages, Roles, Steps, Warp } from "./future";
import { Countdown, FilmGate, FilmLook, PaperMap, PhoneBook, SearchTurn, Year } from "./vintage";

/* "Get found locally" — 30 s, 16 bars at 128 BPM.
   Act I (beats 0–16): 1975, on film. Act II (16–56): now, in light. Act III (56–64): the offer. */

const fontHandle = delayRender("local-fonts");
if (typeof document !== "undefined") {
  const s = document.createElement("style");
  s.textContent = `
@font-face { font-family: 'Abril Fatface'; src: url('${staticFile("AbrilFatface.woff2")}') format('woff2'); font-display: block; }
@font-face { font-family: 'Special Elite'; src: url('${staticFile("SpecialElite.woff2")}') format('woff2'); font-display: block; }`;
  document.head.appendChild(s);
  Promise.all([document.fonts.load("100px 'Abril Fatface'"), document.fonts.load("40px 'Special Elite'"), document.fonts.load("900 100px Archivo"), document.fonts.load("400 20px 'JetBrains Mono'")])
    .then(() => continueRender(fontHandle)).catch(() => continueRender(fontHandle));
}

type Sc = React.FC<{ f: number }>;
const ACT1: [number, number, Sc][] = [[0, 4, Countdown], [4, 8, PhoneBook], [8, 12, PaperMap], [12, 16, SearchTurn]];
const ACT2: [number, number, Sc][] = [[16, 24, City], [24, 36, Features], [36, 40, Steps], [40, 44, Roles], [44, 48, Packages], [48, 52, Honest], [52, 56, Warp]];
const pick = (list: [number, number, Sc][], f: number) => list.find(([s, e]) => f >= b(s) && f < b(e));

const SECTIONS: [number, string][] = [[16, "01 · Near me"], [24, "02 · The monthly work"], [36, "03 · How it works"], [40, "04 · The line-up"], [44, "05 · Packages"], [48, "06 · Straight answers"], [52, "07 · Every month"]];

export const Local: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = (fr: number, cfg?: object) => spring({ frame: fr, fps, config: cfg as never });

  // the turn: sepia drains, the 4:3 gate opens, the film look fades
  const sepia = 1 - ip(f, [b(14), b(15.6)], [0, 1]);
  const gate = ip(f, [b(14), b(15.5)], [0, 1]);
  const weave = f < b(16) ? `translate(${((random(`wx${f}`) - 0.5) * 4 * sepia).toFixed(1)}px, ${((random(`wy${f}`) - 0.5) * 5 * sepia).toFixed(1)}px)` : "";

  // pixel shakes on the two impacts
  let shake = "";
  for (const [at, dur, amp] of [[b(16), 30, 30], [b(55), b(0.5), 14], [b(56), 34, 36]] as [number, number, number][]) {
    if (f >= at && f < at + dur) { const d = Math.pow(1 - (f - at) / dur, 2); shake = `translate(${((random(`sx${f}`) - 0.5) * 2 * amp * d).toFixed(1)}px, ${((random(`sy${f}`) - 0.5) * 2 * amp * d).toFixed(1)}px)`; }
  }

  let body: React.ReactNode;
  if (f < b(16)) {
    const [s0, , S] = pick(ACT1, f)!;
    body = (
      <AbsoluteFill style={{ filter: `sepia(${sepia.toFixed(3)}) saturate(${(1 - 0.25 * sepia).toFixed(3)}) contrast(${(1 + 0.1 * sepia).toFixed(3)})`, transform: weave }}>
        <S f={f - b(s0)} />
        <FilmLook f={f} amount={sepia} />
      </AbsoluteFill>
    );
  } else if (f < b(56)) {
    const [s0, , S] = pick(ACT2, f)!;
    body = <S f={f - b(s0)} />;
  } else {
    body = <Land f={f - b(56)} spring={sp} />;
  }
  const section = [...SECTIONS].reverse().find(([s]) => f >= b(s));
  const sec = Math.floor(f / 60), fr = f % 60;
  const hud = f >= b(15.6) && f < b(55.5) && !(f >= b(48) && f < b(52));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ transform: shake }}>{body}</AbsoluteFill>
      <FilmGate f={f} open={gate} />
      {f < b(55.5) && <Year f={f} />}
      {hud && (
        <>
          <Hud size={18} color={F.ice} style={{ position: "absolute", right: 40, top: 36, opacity: 0.8 }}>Manywright / Get found locally</Hud>
          <Hud size={18} color={F.cyan} style={{ position: "absolute", left: 40, bottom: 34, opacity: 0.8 }}>{section ? section[1] : ""}</Hud>
          <Hud size={18} color={F.ice} style={{ position: "absolute", right: 40, bottom: 34, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>00:00:{String(sec).padStart(2, "0")}:{String(fr).padStart(2, "0")}</Hud>
        </>
      )}
      <Audio src={staticFile("local.wav")} />
    </AbsoluteFill>
  );
};
