// Manywright reel soundtrack: 128 BPM, A minor, 8 bars = exactly 15 s.
// Pure-JS synthesis (no samples, no deps). Every event sits on the same beat grid
// the visuals use (see src/timing.ts), so cuts land on hits by construction.
import { writeFileSync } from "node:fs";

const SR = 48000, DUR = 15, N = SR * DUR;
const BPM = 128, BEAT = 60 / BPM;
const T = (b) => b * BEAT;

// deterministic noise
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

// ---------- buses ----------
const mk = () => [new Float32Array(N), new Float32Array(N)];
const bus = { drums: mk(), music: mk(), fx: mk(), send: mk() };
function put(name, t0, mono, gain = 1, pan = 0, send = 0) {
  const s0 = Math.round(t0 * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
  const [L, R] = bus[name], [SL, SRr] = bus.send;
  for (let i = 0; i < mono.length; i++) {
    const j = s0 + i; if (j < 0 || j >= N) continue;
    L[j] += mono[i] * gl; R[j] += mono[i] * gr;
    if (send) { SL[j] += mono[i] * gl * send; SRr[j] += mono[i] * gr * send; }
  }
}

// ---------- DSP primitives ----------
class Biquad {
  constructor(type, f, q = 0.707) { this.type = type; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f, q); }
  set(f, q = this.q || 0.707) {
    this.q = q;
    const w = 2 * Math.PI * Math.min(Math.max(f, 20), SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2;
    if (this.type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (this.type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = a; b1 = 0; b2 = -a; }
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}
// filter with a cutoff that follows fn(tSec)
function filt(buf, type, fn, q = 0.707) {
  const f = new Biquad(type, typeof fn === "number" ? fn : fn(0), q);
  for (let i = 0; i < buf.length; i++) {
    if (typeof fn !== "number" && (i & 31) === 0) f.set(fn(i / SR), q);
    buf[i] = f.p(buf[i]);
  }
  return buf;
}
const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
function saw(len, freqFn, ph = Math.abs(rnd())) {
  const n = Math.round(len * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = typeof freqFn === "number" ? freqFn : freqFn(i / SR), dt = f / SR;
    out[i] = 2 * ph - 1 - blep(ph, dt); ph += dt; if (ph >= 1) ph -= 1;
  }
  return out;
}
function sine(len, freqFn, ph = 0) {
  const n = Math.round(len * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const f = typeof freqFn === "number" ? freqFn : freqFn(i / SR); out[i] = Math.sin(ph); ph += 2 * Math.PI * f / SR; }
  return out;
}
const noise = (len) => { const n = Math.round(len * SR), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = rnd(); return o; };
const mul = (buf, fn) => { for (let i = 0; i < buf.length; i++) buf[i] *= fn(i / SR, i); return buf; };
const add = (a, b, g = 1) => { const o = new Float32Array(Math.max(a.length, b.length)); for (let i = 0; i < o.length; i++) o[i] = (a[i] || 0) + (b[i] || 0) * g; return o; };
const ar = (a, r, len) => (t) => Math.min(1, t / a) * (t > len - r ? Math.max(0, (len - t) / r) : 1);
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const cents = (f, c) => f * Math.pow(2, c / 1200);

// ---------- instruments ----------
function kick(amp = 1) {
  const len = 0.5; let ph = 0; const n = Math.round(len * SR), o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 44 + 120 * Math.exp(-t * 32);
    ph += 2 * Math.PI * f / SR;
    o[i] = Math.tanh(Math.sin(ph) * Math.exp(-t * 6.5) * 2.2) * 0.9 + rnd() * Math.exp(-t * 500) * 0.35;
  }
  return mul(o, () => amp);
}
function clap() {
  const b = filt(noise(0.3), "bp", 1300, 1.1);
  mul(b, (t) => { const burst = [0, 0.009, 0.018].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) * 180) : 0), 0); return burst * 0.5 + (t > 0.02 ? Math.exp(-(t - 0.02) * 14) : 0); });
  return add(b, mul(sine(0.12, 210), (t) => Math.exp(-t * 40) * 0.3));
}
function snare(amp = 1) {
  const b = filt(filt(noise(0.2), "hp", 900), "bp", 2200, 0.8);
  mul(b, (t) => Math.exp(-t * 22) * 0.9 * amp);
  return add(b, mul(sine(0.1, 190), (t) => Math.exp(-t * 45) * 0.45 * amp));
}
function hat(open = false, amp = 1) {
  const b = filt(filt(noise(open ? 0.35 : 0.06), "hp", 7500), "bp", 10000, 0.6);
  return mul(b, (t) => Math.exp(-t * (open ? 11 : 75)) * amp);
}
function bass(f, len) {
  let o = add(add(saw(len, f), saw(len, cents(f, 9)), 0.8), sine(len, f / 2), 0.9);
  o = filt(o, "lp", (t) => 220 + 1400 * Math.exp(-t * 22), 1.2);
  return mul(o, ar(0.003, 0.03, len));
}
function pad(freqs, len, cutoff = () => 1500) {
  let o = new Float32Array(Math.round(len * SR));
  freqs.forEach((f) => [-11, 0, 11].forEach((c) => { o = add(o, saw(len, cents(f, c)), 0.18); }));
  filt(o, "lp", cutoff, 0.9);
  return mul(o, ar(0.12, 0.35, len));
}
function stab(freqs, len = 0.4, bright = 6500) {
  let o = new Float32Array(Math.round(len * SR));
  freqs.forEach((f) => [-17, -6, 6, 17].forEach((c) => { o = add(o, saw(len, cents(f, c)), 0.14); o = add(o, saw(len, cents(f * 2, c)), 0.05); }));
  filt(o, "lp", (t) => 900 + bright * Math.exp(-t * 9), 1.4);
  return mul(o, (t) => Math.min(1, t / 0.002) * Math.exp(-t * 4.2));
}
function pluck(f) {
  const len = 0.32; let o = add(saw(len, f), saw(len, cents(f, 7)), 0.7);
  filt(o, "lp", (t) => 500 + 5000 * Math.exp(-t * 16), 2);
  return mul(o, (t) => Math.min(1, t / 0.002) * Math.exp(-t * 9) * 0.6);
}
function blip(f) { return mul(sine(0.16, (t) => f * (1 + 0.6 * Math.exp(-t * 60))), (t) => Math.exp(-t * 24) * 0.5); }
function tick(f) { return add(mul(sine(0.05, f), (t) => Math.exp(-t * 90) * 0.4), mul(filt(noise(0.02), "hp", 6000), (t) => Math.exp(-t * 300) * 0.3)); }
function impact() {
  const sub = mul(sine(3.2, (t) => 34 + 30 * Math.exp(-t * 3)), (t) => Math.tanh(Math.exp(-t * 1.25) * 1.8) * 0.95);
  const thud = mul(filt(noise(1.2), "lp", (t) => 3000 * Math.exp(-t * 4) + 120, 0.8), (t) => Math.exp(-t * 5) * 0.8);
  const zap = mul(filt(saw(0.45, (t) => 60 + 900 * Math.exp(-t * 12)), "lp", 2500), (t) => Math.exp(-t * 8) * 0.35);
  return add(add(sub, thud), zap);
}
function crash() {
  const b = filt(noise(2.6), "hp", 3800);
  return mul(b, (t) => Math.min(1, t / 0.003) * Math.exp(-t * 1.6) * 0.45);
}
function riser(len) {
  const nz = mul(filt(noise(len), "bp", (t) => 250 * Math.pow(36, t / len), 2.2), (t) => Math.pow(t / len, 2.2) * 0.9);
  const tone = mul(filt(saw(len, (t) => 140 * Math.pow(9, Math.pow(t / len, 1.6))), "lp", 3500), (t) => Math.pow(t / len, 2) * 0.2);
  return add(nz, tone);
}
function bell(f, len = 2.5) {
  let o = new Float32Array(Math.round(len * SR));
  [[1, 1], [2.76, 0.32], [5.4, 0.12], [8.93, 0.05]].forEach(([m, g]) => { o = add(o, mul(sine(len, f * m), (t) => Math.exp(-t * (1.6 + m * 0.7))), g); });
  return mul(o, (t) => Math.min(1, t / 0.002) * 0.35);
}

// ---------- harmony ----------
const CH = {
  Am: [57, 60, 64], F: [53, 57, 60], C: [55, 60, 64], G: [55, 59, 62], Dm: [57, 62, 65], E: [56, 59, 64],
};
const ROOT = { Am: 45, F: 41, C: 48, G: 43, Dm: 50, E: 40 };
const BARS = ["Am", "F", "C", "G", "Am", "F", "Dm", "Am"];
const chordAt = (b) => (b >= 24 && b < 28 ? (b < 26 ? "Dm" : "E") : BARS[Math.floor(b / 4)]);

// ---------- arrangement ----------
const kicks = [];
const K = (b, amp = 1) => { kicks.push(T(b)); put("drums", T(b), kick(amp), 0.95); };

// BAR 1 — HOOK: impact, stabs on every beat, 16th stutter on beat 4
put("fx", T(0), impact(), 0.9, 0, 0.15);
put("fx", T(0), crash(), 0.7, 0, 0.3);
[0, 1, 2].forEach((b) => { K(b); put("music", T(b), stab(CH.Am.map(hz).map((f) => f * 2), 0.42), 0.55, 0, 0.35); });
[3, 3.25, 3.5, 3.75].forEach((b, i) => { put("music", T(b), stab(CH.Am.map(hz).map((f) => f * 2), 0.12, 3000 + i * 1500), 0.42 + i * 0.05, i % 2 ? 0.4 : -0.4, 0.3); put("drums", T(b), snare(0.5 + i * 0.15), 0.6); });

// BARS 2–6 — GROOVE
for (let b = 4; b < 24; b++) {
  K(b);
  if (b % 2 === 1) put("drums", T(b), clap(), 0.55, 0, 0.18);
  for (let s = 0; s < 4; s++) {
    const t = T(b + s / 4);
    put("drums", t, hat(s === 2, s === 2 ? 0.55 : (s % 2 ? 0.45 : 0.28)), 0.5, s % 2 ? 0.25 : -0.15);
    if (s > 0) put("music", t, bass(hz(ROOT[chordAt(b)]), BEAT / 4 * 0.92), s === 2 ? 0.5 : 0.4);
  }
}
// pads (ducked) bars 2–7
for (let bar = 1; bar < 7; bar++) {
  const b0 = bar * 4;
  if (bar === 6) {
    put("music", T(24), pad(CH.Dm.map(hz), T(2) + 0.1, (t) => 600 + 3000 * t), 0.5, 0, 0.3);
    put("music", T(26), pad(CH.E.map(hz), T(1.5) + 0.05, (t) => 1800 + 6000 * t), 0.5, 0, 0.3);
  } else put("music", T(b0), pad(CH[BARS[bar]].map(hz), T(4) + 0.1), 0.42, 0, 0.3);
}
// typography: a tick per word (13 words on 8ths from beat 4)
for (let i = 0; i < 13; i++) put("fx", T(4 + i * 0.5), tick(i % 2 ? 2400 : 1800), 0.5, i % 2 ? 0.5 : -0.5, 0.15);
// counter roll: 32nd ticks rising, beats 10.5–12
for (let i = 0; i < 12; i++) put("fx", T(10.5 + i / 8), tick(1200 + i * 160), 0.35 + i * 0.02, 0, 0.1);
// shapes: pentatonic blips on each shape move
[[12, 79], [12.5, 81], [13, 84], [13.5, 86], [14, 88], [14.25, 86], [14.5, 84], [14.75, 81], [15, 91], [15.5, 93]].forEach(([b, m], i) => put("fx", T(b), blip(hz(m)), 0.6, i % 2 ? 0.45 : -0.45, 0.4));
// camera: a long whoosh panned L→R across bar 5
{
  const len = T(4), w = mul(filt(noise(len), "bp", (t) => 350 + 2600 * Math.sin(Math.PI * t / len), 1.4), (t) => Math.pow(Math.sin(Math.PI * t / len), 1.5) * 0.7);
  const s0 = Math.round(T(16) * SR), [L, R] = bus.fx;
  for (let i = 0; i < w.length; i++) { const p = i / w.length, j = s0 + i; L[j] += w[i] * Math.cos(p * Math.PI / 2); R[j] += w[i] * Math.sin(p * Math.PI / 2); }
}
// colours: 8 plucks, one per service word
[77, 81, 84, 89, 88, 84, 81, 84].forEach((m, i) => put("music", T(20 + i * 0.5), pluck(hz(m)), 0.55, i % 2 ? 0.35 : -0.35, 0.45));

// BAR 7 — BUILD: kicks thin out, snare roll accelerates, riser, then half a beat of silence
K(24); K(25); K(26); K(26.5); K(27, 0.9); K(27.25, 0.8);
for (let b = 24; b < 27.5; b += b < 26 ? 0.5 : b < 27 ? 0.25 : 0.125) put("drums", T(b), snare(0.35 + (b - 24) * 0.2), 0.7, 0, 0.2);
put("fx", T(24), riser(T(3.5)), 0.8, 0, 0.25);
["ONE", "ONE", "ONE"].forEach((_, i) => put("music", T(24 + i), stab([hz(69 + i * 2), hz(74 + i * 2)], 0.3, 5000), 0.4, 0, 0.4));

// BAR 8 — LAND: impact, full chord, crash, bell; long tail
K(28, 1.1);
put("fx", T(28), impact(), 1, 0, 0.2);
put("fx", T(28), crash(), 0.85, 0, 0.35);
put("music", T(28), stab(CH.Am.map(hz).map((f) => f * 2), 1.6, 8000), 0.6, 0, 0.5);
put("music", T(28), pad([45, ...CH.Am, 72].map(hz), 15 - T(28), (t) => 2600 * Math.exp(-t * 0.8) + 400), 0.5, 0, 0.4);
put("music", T(28), bell(hz(81)), 0.8, 0.2, 0.5);
put("music", T(29), bell(hz(76), 2), 0.35, -0.3, 0.6);

// ---------- sidechain duck on the music bus ----------
const duck = new Float32Array(N).fill(1);
kicks.forEach((tk) => { const s = Math.round(tk * SR); for (let i = 0; i < SR * 0.4 && s + i < N; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.62 * Math.exp(-(i / SR) * 10)); });

// ---------- reverb (Freeverb-style) on the send bus ----------
function reverb([inL, inR]) {
  const sc = SR / 44100, combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  const run = (input, off) => {
    const out = new Float32Array(N);
    const cs = combs.map((l) => ({ buf: new Float32Array(Math.round((l + off) * sc)), i: 0, f: 0 }));
    const as = aps.map((l) => ({ buf: new Float32Array(Math.round((l + off) * sc)), i: 0 }));
    for (let n = 0; n < N; n++) {
      const x = input[n] * 0.015; let y = 0;
      for (const c of cs) { const o = c.buf[c.i]; c.f = o * 0.8 + c.f * 0.2; c.buf[c.i] = x + c.f * 0.86; c.i = (c.i + 1) % c.buf.length; y += o; }
      for (const a of as) { const b = a.buf[a.i]; const o = -y + b; a.buf[a.i] = y + b * 0.5; a.i = (a.i + 1) % a.buf.length; y = o; }
      out[n] = y;
    }
    return out;
  };
  return [run(inL, 0), run(inR, 23)];
}
const [RL, RR] = reverb(bus.send);

// ---------- master ----------
const L = new Float32Array(N), R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR, fadeOut = t > 14.2 ? Math.max(0, (15 - t) / 0.8) : 1;
  const l = bus.drums[0][i] + bus.music[0][i] * duck[i] + bus.fx[0][i] + RL[i] * 1.1;
  const r = bus.drums[1][i] + bus.music[1][i] * duck[i] + bus.fx[1][i] + RR[i] * 1.1;
  L[i] = Math.tanh(l * 0.9) * fadeOut; R[i] = Math.tanh(r * 0.9) * fadeOut;
}
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.89 / peak;

const out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); out.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
writeFileSync(new URL("../public/music.wav", import.meta.url), out);
console.log("wrote public/music.wav", (out.length / 1e6).toFixed(1) + " MB, peak gain", g.toFixed(2));
