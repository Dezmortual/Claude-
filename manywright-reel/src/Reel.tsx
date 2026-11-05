import React from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { b, BF, C, MONO, shake } from "./lib";
import { Build, Camera, Colour, Disciplines, Hook, Land, Shapes } from "./scenes";

// ---- fonts: local variable files, render waits until both are ready
const fontHandle = delayRender("fonts");
const css = `
@font-face { font-family: 'Archivo'; src: url('${staticFile("Archivo-var.woff2")}') format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; font-display: block; }
@font-face { font-family: 'JetBrains Mono'; src: url('${staticFile("JetBrainsMono-var.woff2")}') format('woff2'); font-weight: 100 800; font-display: block; }`;
if (typeof document !== "undefined") {
  const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  Promise.all([document.fonts.load("900 100px Archivo"), document.fonts.load("400 20px 'JetBrains Mono'")])
    .then(() => continueRender(fontHandle)).catch(() => continueRender(fontHandle));
}

// scene boundaries in beats
const SCENES: [number, number, React.FC<{ f: number; fps: number }>][] = [
  [0, 4, Hook], [4, 12, Disciplines], [12, 16, Shapes], [16, 20, Camera], [20, 24, Colour], [24, 28, Build], [28, 32.1, Land],
];

const Hud: React.FC<{ f: number }> = ({ f }) => {
  const sec = Math.floor(f / 60), fr = f % 60;
  const beat = Math.floor(f / BF), bar = Math.floor(beat / 4) + 1, inBar = beat % 4;
  return (
    <AbsoluteFill style={{ mixBlendMode: "difference", color: "#fff", fontFamily: MONO, fontSize: 17, letterSpacing: "0.1em", pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 40, top: 34, opacity: 0.85 }}>MANYWRIGHT / MOTION REEL 2026</div>
      <div style={{ position: "absolute", right: 40, top: 34, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>
        00:00:{String(sec).padStart(2, "0")}:{String(fr).padStart(2, "0")}
      </div>
      <div style={{ position: "absolute", left: 40, bottom: 34, display: "flex", alignItems: "center", gap: 14, opacity: 0.85 }}>
        <span>128 BPM · BAR {bar}/8</span>
        <span style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2, 3].map((i) => <i key={i} style={{ width: 10, height: 10, border: "1.5px solid #fff", background: i === inBar ? "#fff" : "transparent" }} />)}
        </span>
      </div>
      <div style={{ position: "absolute", right: 40, bottom: 34, opacity: 0.85 }}>MANYWRIGHT.COM</div>
    </AbsoluteFill>
  );
};

const Grain: React.FC<{ f: number; opacity: number }> = ({ f, opacity }) => (
  <AbsoluteFill style={{ opacity, mixBlendMode: "overlay", pointerEvents: "none" }}>
    <svg width="1920" height="1080">
      <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={f % 12} stitchTiles="stitch" /></filter>
      <rect width="100%" height="100%" filter="url(#g)" />
    </svg>
  </AbsoluteFill>
);

export const Reel: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const idx = SCENES.findIndex(([s, e]) => f >= b(s) && f < b(e));
  const [s0, , Scene] = SCENES[idx === -1 ? SCENES.length - 1 : idx];
  const lf = f - b(s0);
  const shakes: [number, number, number][] = [
    [0, 26, 34], [b(3), b(1), 10], [b(4), 10, 8], [b(12), 8, 10], [b(20), 10, 12],
    [b(27), b(0.5), 26], [b(28), 34, 40],
  ];
  const showHud = f < b(27.5);
  const grain = f < b(29) ? 0.09 : Math.max(0, 0.09 - (f - b(29)) * 0.003);
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <AbsoluteFill style={{ transform: shake(f, shakes) }}>
        <Scene f={lf} fps={fps} />
      </AbsoluteFill>
      {showHud && <Hud f={f} />}
      <Grain f={f} opacity={grain} />
      <Audio src={staticFile("music.wav")} />
    </AbsoluteFill>
  );
};
