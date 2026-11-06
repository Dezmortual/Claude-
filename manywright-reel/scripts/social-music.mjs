// Soundtrack for the Social and email showreel: 120 BPM, 24 bars = 48 s.
// Original synthesized music, plus CC0 stock sound effects (Kenney starter kits, see public/social/sfx/CREDITS.txt)
// placed on the moments logged in the real recording (public/social/events.json).
import { readFileSync, writeFileSync } from "node:fs";

const SR = 48000, DUR = 48, N = SR * DUR;
const BPM = 120, BEAT = 60 / BPM;
const T = (b) => b * BEAT;
let seed = 4242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
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


// ---------- stock SFX (CC0) ----------
function readWav(path) {
  const b = readFileSync(path);
  let p = 12, data = null, ch = 2;
  while (p < b.length) { const id = b.toString("ascii", p, p + 4), sz = b.readUInt32LE(p + 4); if (id === "fmt ") ch = b.readUInt16LE(p + 10); if (id === "data") { data = b.subarray(p + 8, p + 8 + sz); break; } p += 8 + sz; }
  const n = data.length / 2 / ch, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = data.readInt16LE((i * ch) * 2) / 32768; R[i] = data.readInt16LE((i * ch + (ch > 1 ? 1 : 0)) * 2) / 32768; }
  return [L, R];
}
const SFX = {};
for (const k of ["coin", "jump", "land", "break", "placement-a", "placement-b", "placement-c", "placement-d", "removal-a", "toggle", "rotate", "impact"]) SFX[k] = readWav(new URL(`../public/social/sfx/${k}.wav`, import.meta.url));
const sfx = (t, k, gain = 0.8, send = 0.15) => {
  const [l, r] = SFX[k], s0 = Math.round(t * SR), [L, R] = bus.fx, [SL, SRr] = bus.send;
  for (let i = 0; i < l.length; i++) { const j = s0 + i; if (j < 0 || j >= N) continue; L[j] += l[i] * gain; R[j] += r[i] * gain; SL[j] += l[i] * gain * send; SRr[j] += r[i] * gain * send; }
};

// ---------- harmony: bright pop in C (F – C – G – Am) ----------
const CH = { F: [53, 57, 60, 64], C: [52, 55, 60, 64], G: [50, 55, 59, 62], Am: [52, 57, 60, 64], Dm: [50, 53, 57, 62], E: [52, 56, 59, 64] };
const ROOT = { F: 41, C: 36, G: 43, Am: 45, Dm: 38, E: 40 };
const PROG = ["F", "C", "G", "Am"];
const chordAt = (b) => (b >= 84 && b < 92 ? (b < 88 ? "Dm" : "E") : PROG[Math.floor(b / 4) % 4]);
const kicks = [];
const K = (b, a = 1) => { kicks.push(T(b)); put("drums", T(b), kick(a), 0.9); };
const snap = (a = 1) => mul(filt(noise(0.06), "bp", 2600, 2), (t) => Math.exp(-t * 90) * a);

// section intensity: 0 intro, 1 stale, 2 groove, 3 drop, 4 groove B, 5 faq-light, 6 build, 7 land
const section = (b) => (b < 6 ? 0 : b < 12 ? 1 : b < 44 ? 2 : b < 60 ? 3 : b < 73 ? 4 : b < 84 ? 5 : b < 92 ? 6 : 7);

for (let b = 0; b < 92; b++) {
  const s = section(b), ch = chordAt(b);
  // kick
  if (s === 0 && b >= 2) K(b, 0.8);
  if (s === 1) K(b, 0.6);
  if (s === 2 || s === 3 || s === 4) K(b, s === 3 ? 1.05 : 1);
  if (s === 5 && b % 2 === 0) K(b, 0.5);
  if (s === 6) { if (b < 88) K(b); else { K(b); K(b + 0.5, 0.9); } }
  // clap / snap
  if (b % 2 === 1 && s >= 2 && s !== 5) put("drums", T(b), clap(), s === 3 ? 0.6 : 0.5, 0, 0.2);
  if (s === 5 && b % 2 === 1) put("drums", T(b), snap(), 0.55, 0.2, 0.2);
  // hats
  for (let q = 0; q < 4; q++) {
    if (s === 1 && q % 2) continue;
    put("drums", T(b + q / 4), hat(q === 2, q === 2 ? 0.5 : (q % 2 ? 0.4 : 0.22)), s === 5 ? 0.25 : 0.42, q % 2 ? 0.3 : -0.2);
  }
  // offbeat pluck chords (the house "pump"), muffled in the stale section
  for (const off of [0.5, 1.5].filter((o) => (b % 2 === 0 ? o === 0.5 : o === 0.5))) {
    const notes = CH[ch].map((m) => hz(m + 12));
    let st = stab(notes, 0.28, s === 1 ? 900 : s === 3 ? 7500 : 5000);
    if (s === 1) st = filt(st, "lp", 700);
    put("music", T(b + off), st, s === 3 ? 0.42 : 0.34, 0, 0.35);
  }
  // bass: bouncy octaves on 8ths
  if (s >= 2 && s !== 5) for (let e = 0; e < 2; e++) put("music", T(b + e * 0.5), bass(hz(ROOT[ch] + (e ? 12 : 0)), BEAT / 2 * 0.85), 0.42);
  if (s === 1 || s === 5) put("music", T(b), bass(hz(ROOT[ch]), BEAT * 0.9), 0.3);
  // arp sparkle in groove B and the drop
  if (s === 3 || s === 4) for (let q = 0; q < 4; q++) put("music", T(b + q / 4), pluck(hz(CH[ch][(b * 4 + q) % 4] + 24)), 0.13, q % 2 ? 0.45 : -0.45, 0.4);
}
// pads under every bar (sidechained)
for (let bar = 0; bar < 23; bar++) {
  const b0 = bar * 4, ch = chordAt(b0), s = section(b0);
  put("music", T(b0), pad(CH[ch].map(hz), T(4) + 0.1, (t) => (s === 1 ? 500 : s === 5 ? 1100 : 1700)), s === 3 ? 0.42 : 0.32, 0, 0.3);
}
// risers into the drop (beat 44 = 22 s) and the landing (beat 92 = 46 s)
put("fx", T(40), riser(T(4)), 0.55, 0, 0.3);
for (let b = 42; b < 44; b += b < 43 ? 0.25 : 0.125) put("drums", T(b), snare(0.3 + (b - 42) * 0.3), 0.55);
put("fx", T(86), riser(T(5.5)), 0.7, 0, 0.3);
for (let b = 88; b < 91.5; b += b < 90 ? 0.5 : b < 91 ? 0.25 : 0.125) put("drums", T(b), snare(0.35 + (b - 88) * 0.18), 0.65, 0, 0.2);
// landing
K(92, 1.1);
put("music", T(92), stab([60, 64, 67, 72].map(hz), 1.8, 8000), 0.55, 0, 0.5);
put("music", T(92), pad([48, 60, 64, 67, 72].map(hz), 48 - T(92), (t) => 2600 * Math.exp(-t * 0.7) + 400), 0.45, 0, 0.4);
put("music", T(92), bell(hz(84)), 0.7, 0.2, 0.5);
put("music", T(93), bell(hz(79), 2), 0.35, -0.3, 0.6);

// ---------- SFX cue sheet, from the recording's event log ----------
const ev = JSON.parse(readFileSync(new URL("../public/social/events.json", import.meta.url)));
const evT = (key) => ev.find((e) => e.key === key).t;
sfx(0, "impact", 0.9, 0.3);
sfx(0.9, "jump", 0.7); sfx(1.6, "placement-a", 0.8); sfx(2.0, "placement-b", 0.8);
sfx(3.8, "break", 0.6, 0.3);
for (let i = 0; i < 6; i++) { sfx(6.8 + i * 2.5, "jump", 0.6); sfx(6.8 + i * 2.5 + 0.5, "land", 0.7); }
for (let k = 0; k < 9; k++) sfx(11.2 + k * 0.25, "rotate", 0.35, 0); // scheduled-for-you clock ticks
sfx(21.0, "removal-a", 0.45, 0.2);
sfx(evT("packagesBtn"), "toggle", 1.0, 0); sfx(evT("packagesBtn"), "impact", 0.55, 0.3);
sfx(23.2, "jump", 0.6); sfx(23.7, "coin", 0.7, 0.3);
sfx(25.45, "jump", 0.6); sfx(25.95, "coin", 0.7, 0.3);
sfx(27.85, "jump", 0.6); for (let i = 0; i < 5; i++) sfx(28.3 + i * 0.16, ["placement-a", "placement-b", "placement-c", "placement-d", "placement-a"][i], 0.6);
[30.3, 30.6, 30.9, 31.2].forEach((t, i) => sfx(t, ["placement-a", "placement-b", "placement-c", "placement-d"][i], 0.75));
for (let i = 0; i < 5; i++) sfx(33.75 + i * 0.15, ["placement-d", "placement-c", "placement-b", "placement-a", "placement-d"][i], 0.65);
sfx(evT("faq1"), "toggle", 1.0, 0); sfx(37.75, "jump", 0.6);
sfx(evT("faq4"), "toggle", 1.0, 0); sfx(39.75, "jump", 0.6);
sfx(41.9, "jump", 0.6); sfx(evT("proposal"), "toggle", 1.0, 0); sfx(44.8, "placement-d", 0.6);
sfx(46.0, "impact", 1.0, 0.3); sfx(46.4, "coin", 0.5, 0.4);

const duck = new Float32Array(N).fill(1);
kicks.forEach((tk) => { const s = Math.round(tk * SR); for (let i = 0; i < SR * 0.35 && s + i < N; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.6 * Math.exp(-(i / SR) * 11)); });
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
const L = new Float32Array(N), R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR, fadeOut = t > 47.2 ? Math.max(0, (48 - t) / 0.8) : 1;
  const l = bus.drums[0][i] + bus.music[0][i] * duck[i] + bus.fx[0][i] + RL[i] * 1.1;
  const r = bus.drums[1][i] + bus.music[1][i] * duck[i] + bus.fx[1][i] + RR[i] * 1.1;
  L[i] = Math.tanh(l * 0.85) * fadeOut; R[i] = Math.tanh(r * 0.85) * fadeOut;
}
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.89 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); out.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
writeFileSync(new URL("../public/social/music.wav", import.meta.url), out);
console.log("wrote public/social/music.wav, gain", g.toFixed(2));
