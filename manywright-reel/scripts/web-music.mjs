// Chiptune soundtrack for the Manywright website-development pixel piece: 128 BPM, A minor, 8 bars = exactly 15 s.
// Four classic channels (two pulse, triangle, noise) plus game SFX placed on the shared beat grid.
import { writeFileSync } from "node:fs";

const SR = 48000, DUR = 15, N = SR * DUR;
const BEAT = 60 / 128;
const T = (b) => b * BEAT;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const L = new Float32Array(N), R = new Float32Array(N);
function put(t0, buf, gain = 1, pan = 0) {
  const s0 = Math.round(t0 * SR), gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = 0; i < buf.length; i++) { const j = s0 + i; if (j >= 0 && j < N) { L[j] += buf[i] * gl; R[j] += buf[i] * gr; } }
}
// ---- oscillators (deliberately raw, then softened slightly)
function pulse(len, fFn, duty = 0.25, envFn = () => 1) {
  const n = Math.round(len * SR), o = new Float32Array(n); let ph = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = typeof fFn === "number" ? fFn : fFn(t);
    ph = (ph + f / SR) % 1;
    const x = ph < duty ? 1 : -1;
    lp += (x - lp) * 0.35; // tame aliasing a little
    o[i] = Math.round(lp * 7) / 7 * envFn(t); // ~4-bit amplitude steps
  }
  return o;
}
function tri(len, fFn, envFn = () => 1) {
  const n = Math.round(len * SR), o = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = typeof fFn === "number" ? fFn : fFn(t);
    ph = (ph + f / SR) % 1;
    const x = 1 - 4 * Math.abs(ph - 0.5);
    o[i] = Math.round(x * 8) / 8 * envFn(t); // stepped triangle like the 2A03
  }
  return o;
}
function noise(len, envFn, rate = 1) { // sample-and-hold noise, `rate` = how often it changes
  const n = Math.round(len * SR), o = new Float32Array(n); let v = 0, c = 0;
  const hold = Math.max(1, Math.round(1 / rate));
  for (let i = 0; i < n; i++) { if (c++ % hold === 0) v = rnd(); o[i] = v * envFn(i / SR); }
  return o;
}
const dec = (k, a = 0.002) => (t) => Math.min(1, t / a) * Math.exp(-t * k);
const gate = (len, a = 0.003, r = 0.02) => (t) => Math.min(1, t / a) * (t > len - r ? Math.max(0, (len - t) / r) : 1);

// ---- drums + SFX
const kick = () => { const k = tri(0.22, (t) => 40 + 180 * Math.exp(-t * 40), dec(14)); const n = noise(0.03, dec(120), 1); for (let i = 0; i < n.length; i++) k[i] += n[i] * 0.4; return k; };
const snare = (a = 1) => noise(0.16, (t) => dec(24)(t) * a, 0.5);
const hat = (open) => noise(open ? 0.12 : 0.03, dec(open ? 30 : 140), 1);
const blip = (m) => pulse(0.045, hz(m), 0.5, dec(50));
const coin = () => { const a = pulse(0.07, hz(83), 0.5, gate(0.07)), b = pulse(0.32, hz(88), 0.5, dec(9)); const o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
const jump = () => pulse(0.18, (t) => 300 * Math.pow(4, t / 0.18), 0.25, dec(10));
const power = () => { const notes = [69, 72, 76, 81, 84, 88]; const o = new Float32Array(Math.round(SR * 0.6)); notes.forEach((m, i) => { const p = pulse(0.09, hz(m), 0.125, gate(0.09)); o.set(p, Math.round(i * 0.06 * SR)); }); return o; };
const boom = () => { const n = noise(1.4, dec(3.2), 0.18); const t = tri(1.0, (x) => 30 + 90 * Math.exp(-x * 6), dec(4)); for (let i = 0; i < t.length; i++) n[i] += t[i] * 0.9; return n; };
const sweep = (len, up = true) => noise(len, (t) => Math.sin(Math.PI * t / len) * 0.6, up ? 0.08 : 0.3);

// ---- harmony
const CH = { Am: [57, 60, 64], F: [53, 57, 60], C: [48, 55, 60, 64].slice(1), G: [55, 59, 62], Dm: [50, 53, 57], E: [52, 56, 59] };
const BAR = ["Am", "F", "C", "G", "Am", "F", "Dm", "Am"];
const chordAt = (b) => (b >= 24 && b < 28 ? (b < 26 ? "Dm" : "E") : BAR[Math.floor(b / 4)]);
const ROOT = { Am: 45, F: 41, C: 48, G: 43, Dm: 38, E: 40 };

// BAR 1 — hook: explosion, "YOUR SITE." then "ON EVERY PHONE." typed, stutter on beat 4
put(T(0), boom(), 0.9);
put(T(0), power(), 0.35, 0.2);
put(T(0), kick(), 1);
for (let i = 0; i < 10; i++) put(T(0.5 + i * 0.09), blip(84 + (i % 3) * 3), 0.18, i % 2 ? 0.3 : -0.3);
for (let i = 0; i < 15; i++) put(T(2 + i * 0.06), blip(88 + (i % 2) * 5), 0.17);
[1, 2].forEach((b) => put(T(b), kick(), 0.9));
[3, 3.25, 3.5, 3.75].forEach((b, i) => { put(T(b), snare(0.6 + i * 0.12), 0.6); put(T(b), pulse(0.1, hz(81 + i * 2), 0.5, dec(18)), 0.2); });

// BARS 2–6 — groove
for (let b = 4; b < 24; b++) {
  put(T(b), kick(), 0.95);
  if (b % 2) put(T(b), snare(), 0.55);
  for (let s = 0; s < 4; s++) {
    const t = T(b + s / 4), ch = CH[chordAt(b)];
    put(t, hat(s === 2), s === 2 ? 0.22 : 0.14, 0.2);
    put(t, pulse(BEAT / 4 * 0.9, hz(ch[(b * 4 + s) % 3] + 12), 0.125, gate(BEAT / 4 * 0.9)), 0.07, -0.35);
    if (s % 2 === 0) put(t, tri(BEAT / 2 * 0.95, hz(ROOT[chordAt(b)] + (s === 2 ? 12 : 0)), gate(BEAT / 2 * 0.95)), 0.32);
  }
}
const PAT = [0, 1, 2, 1, 2, 1, 0, 2];
for (let b = 8; b < 24; b += 0.5) {
  if (b >= 16 && b < 20) continue; // the platformer bar uses jump SFX instead
  const ch = CH[chordAt(Math.floor(b))], k = Math.round(b * 2) % 8;
  put(T(b), pulse(BEAT / 2 * 0.8, hz(ch[PAT[k]] + 24), 0.25, (t) => gate(BEAT / 2 * 0.8)(t) * (1 - t * 1.2)), 0.1, 0.25);
}
// phone: forms (whoosh), UI rows load on 8ths, tap → ring trill → coin for the enquiry
put(T(4), sweep(0.35), 0.25, -0.4);
for (let i = 0; i < 6; i++) put(T(4.5 + i * 0.25), blip(76 + i * 2), 0.16, 0.3);
put(T(6), noise(0.03, dec(200), 1), 0.4);
for (let i = 0; i < 8; i++) put(T(6.1 + i * 0.09), pulse(0.08, hz(i % 2 ? 88 : 84), 0.5, gate(0.08)), 0.12);
put(T(7), coin(), 0.2);
// six inclusions: a coin each; six pages pop on 16ths
for (let i = 0; i < 6; i++) put(T(8 + i * 0.5), coin(), 0.15, i % 2 ? 0.4 : -0.4);
for (let i = 0; i < 6; i++) put(T(11 + i / 6), blip(81 + i * 2), 0.2);
// checks: gauge sweep, a tick per item, then the go-live stamp
put(T(12), pulse(0.9, (t) => 300 + 900 * (t / 0.9), 0.5, (t) => Math.sin(Math.PI * t / 0.9) * 0.6), 0.12);
[12.5, 13, 13.5, 14].forEach((b, i) => put(T(b), pulse(0.12, hz(84 + i * 3), 0.25, dec(14)), 0.2));
put(T(15), power(), 0.4);
// platformer: a jump per beat, landing thud, flag jingle
for (let i = 0; i < 4; i++) { put(T(16 + i), jump(), 0.22); put(T(16 + i + 0.42), kick(), 0.5); }
[[19.5, 76], [19.625, 79], [19.75, 84], [19.875, 88]].forEach(([b, m]) => put(T(b), pulse(0.12, hz(m), 0.5, dec(12)), 0.18));
// eight specialist roles light up: ascending blips
[76, 79, 81, 84, 86, 88, 91, 93].forEach((m, i) => put(T(20 + i * 0.5), blip(m), 0.24, i % 2 ? 0.35 : -0.35));

// BAR 7 — build
for (let b = 24; b < 27.5; b += 0.125) {
  const step = Math.round((b - 24) * 8);
  put(T(b), pulse(0.06, hz(57 + (step % 12) + Math.floor(step / 12) * 12), 0.25, dec(25)), 0.09 + (b - 24) * 0.02);
}
for (let b = 24; b < 27.5; b += b < 26 ? 0.5 : b < 27 ? 0.25 : 0.125) put(T(b), snare(0.4 + (b - 24) * 0.18), 0.55);
[24, 25, 26].forEach((b) => put(T(b), kick(), 0.9));
put(T(24), noise(T(3.5), (t) => Math.pow(t / T(3.5), 2) * 0.5, 0.05), 0.5);

// BAR 8 — land
put(T(28), boom(), 1);
put(T(28), kick(), 1);
[57, 64, 69, 72, 76].forEach((m, i) => put(T(28), pulse(1.6, hz(m), i % 2 ? 0.25 : 0.5, dec(1.6)), 0.08, (i - 2) * 0.2));
[[28.5, 81], [28.75, 84], [29, 88], [29.5, 93]].forEach(([b, m]) => put(T(b), pulse(b === 29.5 ? 1.1 : 0.2, hz(m), 0.25, b === 29.5 ? dec(2.2) : dec(10)), 0.16));
put(T(28), tri(1.8, hz(45), dec(1.4)), 0.5);

// ---- small room + master
const out = Buffer.alloc(44 + N * 4);
const dl = Math.round(0.083 * SR), dr = Math.round(0.111 * SR);
for (let i = 0; i < N; i++) { if (i >= dl) L[i] += R[i - dl] * 0.18; if (i >= dr) R[i] += L[i - dr] * 0.18; }
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = t > 14.2 ? Math.max(0, (15 - t) / 0.8) : 1;
  L[i] = Math.tanh(L[i] * 1.1) * fade; R[i] = Math.tanh(R[i] * 1.1) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.89 / peak;
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); out.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
writeFileSync(new URL("../public/pixel-web.wav", import.meta.url), out);
console.log("wrote public/pixel-web.wav, gain", g.toFixed(2));
