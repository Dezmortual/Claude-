// Sound for the Brand film: a playful marimba-and-whistle tune at 120 BPM (20 bars = 40 s) plus
// hand-made foley (pencil scribbles, lettering, marker squeaks, eraser rubs, page flips, crumples, stamps,
// boings) placed from src/brand/cues.mjs, the same cue sheet the picture uses. Pops and coins are CC0 Kenney SFX.
import { readFileSync, writeFileSync } from "node:fs";
import * as CUE from "../src/brand/cues.mjs";

const SR = 48000, DUR = CUE.DUR, N = SR * DUR;
const BEAT = 60 / CUE.BPM;
const T = (b) => b * BEAT;
let seed = 777;
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


// ---------- stock pops (CC0) ----------
function readWav(path) {
  const b = readFileSync(path); let p = 12, data = null, ch = 2;
  while (p < b.length) { const id = b.toString("ascii", p, p + 4), sz = b.readUInt32LE(p + 4); if (id === "fmt ") ch = b.readUInt16LE(p + 10); if (id === "data") { data = b.subarray(p + 8, p + 8 + sz); break; } p += 8 + sz; }
  const n = data.length / 2 / ch, o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = data.readInt16LE(i * ch * 2) / 32768;
  return o;
}
const POPS = ["placement-a", "placement-b", "placement-c", "placement-d"].map((k) => readWav(new URL(`../public/social/sfx/${k}.wav`, import.meta.url)));
const COINWAV = readWav(new URL("../public/social/sfx/coin.wav", import.meta.url));

// ---------- foley, synthesized ----------
// pencil on paper: band-passed noise in irregular strokes (lettering is choppier and brighter)
function scribble(len, kind) {
  const n = Math.round(len * SR), o = new Float32Array(n);
  const rate = kind === "write" ? 15 : 9;
  const bp = new Biquad("bp", kind === "write" ? 4200 : 3200, 1.6), lp = new Biquad("lp", 700, 0.7);
  let phase = Math.abs(rnd());
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    phase += (rate * (0.8 + 0.4 * Math.abs(Math.sin(t * 3.1)))) / SR;
    const stroke = Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2)), kind === "write" ? 0.6 : 0.35);
    const x = rnd();
    o[i] = (bp.p(x) * 1.2 + lp.p(x) * 0.25) * stroke * Math.min(1, t / 0.02) * Math.min(1, (len - t) / 0.03);
  }
  return o;
}
function markerSqueak(len) {
  const f0 = 1700 + Math.abs(rnd()) * 600;
  const s = sine(len, (t) => f0 + 500 * (t / len) + 60 * Math.sin(t * 2 * Math.PI * 23));
  const nz = filt(noise(len), "bp", 2400, 2);
  return mul(add(s, nz, 0.6), (t) => Math.sin(Math.PI * Math.min(1, t / len)) * 0.35);
}
function eraserRub(len) { return mul(filt(filt(noise(len), "lp", 1600), "hp", 300), (t) => (0.55 + 0.45 * Math.sin(t * 2 * Math.PI * 7)) * Math.sin(Math.PI * t / len) * 0.9); }
function pageFlip(len = 0.38) {
  const sw = mul(filt(noise(len), "bp", (t) => 500 + 3000 * (t / len), 1.1), (t) => Math.sin(Math.PI * t / len) * 0.8);
  const thump = mul(sine(0.12, (t) => 140 * Math.exp(-t * 20) + 60), (t) => Math.exp(-t * 30) * 0.5);
  const o = new Float32Array(sw.length + Math.round(0.12 * SR)); o.set(sw);
  for (let i = 0; i < thump.length; i++) o[sw.length - 2000 + i] += thump[i];
  return o;
}
function pageTick() { return mul(filt(noise(0.09), "bp", 2600, 1.4), (t) => Math.sin(Math.PI * t / 0.09) * 0.6); }
function crumple(len = 0.4) {
  const o = new Float32Array(Math.round(len * SR));
  for (let k = 0; k < 34; k++) {
    const at = Math.round(Math.abs(rnd()) * (o.length - 900)), g = 0.3 + Math.abs(rnd()) * 0.7;
    const burst = mul(filt(noise(0.012), "hp", 1800), (t) => Math.exp(-t * 400) * g);
    for (let i = 0; i < burst.length; i++) o[at + i] += burst[i];
  }
  return o;
}
function whoosh(len = 0.45) { return mul(filt(noise(len), "bp", (t) => 300 + 1800 * Math.sin(Math.PI * t / len), 1.3), (t) => Math.pow(Math.sin(Math.PI * t / len), 1.4) * 0.8); }
function stamp() { return add(mul(sine(0.3, (t) => 50 + 70 * Math.exp(-t * 25)), (t) => Math.exp(-t * 14) * 1.1), mul(filt(noise(0.08), "lp", 1200), (t) => Math.exp(-t * 60) * 0.6)); }
function boing() { return mul(sine(0.6, (t) => 260 + 120 * Math.sin(t * 2 * Math.PI * 9) * Math.exp(-t * 5) + 80 * Math.exp(-t * 3)), (t) => Math.min(1, t / 0.005) * Math.exp(-t * 4.5) * 0.5); }
function sadTrombone() {
  const notes = [[0, 196], [0.22, 185], [0.44, 174.6], [0.66, 164.8]], len = 1.2, o = new Float32Array(Math.round(len * SR));
  notes.forEach(([at, f], k) => { const d = k === 3 ? 0.5 : 0.2; let s = filt(saw(d, (t) => f * (1 + 0.012 * Math.sin(t * 2 * Math.PI * (k === 3 ? 6 : 0)))), "lp", 900, 1.2); s = mul(s, ar(0.02, 0.05, d)); o.set(s.map((v, i) => v * 0.45 + (o[Math.round(at * SR) + i] || 0)), Math.round(at * SR)); });
  return o;
}
function confetti() { const o = new Float32Array(Math.round(0.9 * SR)); for (let k = 0; k < 22; k++) { const at = Math.round(Math.abs(rnd()) * 0.75 * SR), f = 2200 + Math.abs(rnd()) * 3200, b = mul(sine(0.08, f), (t) => Math.exp(-t * 50) * 0.25); for (let i = 0; i < b.length; i++) o[at + i] += b[i]; } return o; }

// ---------- music ----------
const hzM = (m) => 440 * Math.pow(2, (m - 69) / 12);
function marimba(f, len = 0.6) { return mul(add(sine(len, f), sine(len, f * 3.93), 0.25), (t) => Math.min(1, t / 0.002) * Math.exp(-t * (7 + f / 400))); }
function pizz(f) { return mul(add(sine(0.4, f), filt(saw(0.4, f), "lp", 700), 0.25), (t) => Math.min(1, t / 0.004) * Math.exp(-t * 9) * 0.9); }
function shaker(a) { return mul(filt(noise(0.06), "hp", 6000), (t) => Math.sin(Math.PI * t / 0.06) * a); }
function whistle(f, len) {
  const s = sine(len, (t) => f * (1 + 0.012 * Math.sin(t * 2 * Math.PI * 5.5) * Math.min(1, t / 0.15)));
  const br = filt(noise(len), "bp", f * 2, 4);
  return mul(add(s, br, 0.08), (t) => Math.min(1, t / 0.05) * (t > len - 0.08 ? Math.max(0, (len - t) / 0.08) : 1) * 0.35);
}
const CH = { C: [60, 64, 67], G: [55, 59, 62], Am: [57, 60, 64], F: [53, 57, 60] };
const ROOT = { C: 36, G: 43, Am: 45, F: 41 };
const PROG = ["C", "G", "Am", "F"];
const NB = Math.round(DUR / BEAT); // total beats
const chordAt = (b) => (b >= NB - 8 ? "C" : PROG[Math.floor(b / 4) % 4]);
const stop = (t) => (t >= CUE.map(13.0) && t < CUE.map(13.0) + 0.5) || (t >= CUE.map(33.75) && t < CUE.map(33.75) + 0.25); // comic stop-time
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
for (let b = 0; b < NB - 2; b++) {
  const ch = chordAt(b), t = T(b);
  if (stop(t)) continue;
  if (b % 2 === 0 && b >= 2) put("drums", t, kick(0.55), 0.8);
  if (b % 2 === 1 && b >= 2) put("drums", t, clap(), 0.32, 0, 0.25);
  for (let q = 0; q < 4; q++) if (b >= 1) put("drums", T(b + q / 4), shaker(q % 2 ? 0.25 : 0.12), 1, q % 2 ? 0.3 : -0.3);
  // pizzicato bass: root on 1 and 3, fifth on the and of 2
  if (b % 2 === 0) put("music", t, pizz(hzM(ROOT[ch] + 12)), 0.55);
  if (b % 4 === 1) put("music", T(b + 0.5), pizz(hzM(ROOT[ch] + 19)), 0.4);
  // marimba arpeggio in 8ths
  for (let e = 0; e < 2; e++) {
    const k = ARP[(b * 2 + e) % 8], notes = [...CH[ch], CH[ch][0] + 12];
    if (!stop(T(b + e / 2))) put("music", T(b + e / 2), marimba(hzM(notes[k] + 12)), 0.3, e ? 0.35 : -0.35, 0.3);
  }
}
// whistled melody over the opening and the ending
const MEL = [[0, 76, 0.5], [0.5, 79, 0.5], [1, 81, 0.5], [1.5, 79, 0.5], [2, 76, 1], [3, 74, 0.5], [3.5, 72, 0.5], [4, 74, 1.5], [6, 79, 0.5], [6.5, 76, 1.5]];
MEL.forEach(([b, m, l]) => put("music", T(b), whistle(hzM(m), T(l) * 0.95), 1, 0.1, 0.4));
MEL.forEach(([b, m, l]) => put("music", T(NB - 8 + b), whistle(hzM(m), T(l) * 0.95), 1, 0.1, 0.4));
// last chord: marimba roll + bell
for (let k = 0; k < 16; k++) put("music", T(NB - 4) + k * 0.06, marimba(hzM([72, 76, 79, 84][k % 4]), 0.5), 0.25, (k % 4 - 1.5) * 0.2, 0.4);
put("music", T(NB - 4), bell(hzM(84), 2.5), 0.6, 0, 0.5);

// ---------- foley from the cue sheet ----------
const M = CUE.map;
for (const [start, dur, kind] of Object.values(CUE.DRAW)) {
  if (kind === "marker") put("fx", M(start), markerSqueak(dur), 0.9, 0.1, 0.1);
  else put("fx", M(start), scribble(dur, kind), kind === "write" ? 0.75 : 0.9, -0.1, 0.08);
}
CUE.POP.forEach((t, i) => put("fx", M(t), POPS[i % 4], 0.85, (i % 3 - 1) * 0.3, 0.15));
CUE.FLIP.forEach((t) => put("fx", M(t), pageFlip(), 0.9, 0, 0.15));
CUE.PAGE_TICKS.forEach((t) => put("fx", M(t), pageTick(), 0.8, 0.2));
CUE.ERASE.forEach(([t, d]) => put("fx", M(t), eraserRub(d), 0.85, 0.1, 0.1));
CUE.CRUMPLE.forEach((t, i) => put("fx", M(t), crumple(), 0.9, i ? 0.3 : -0.3, 0.1));
CUE.WHOOSH.forEach((t) => put("fx", M(t), whoosh(), 0.7, 0, 0.2));
CUE.STAMP.forEach((t) => put("fx", M(t), stamp(), 0.9, 0, 0.15));
CUE.COIN.forEach((t) => put("fx", M(t), COINWAV, 0.7, 0, 0.3));
CUE.BOING.forEach((t) => put("fx", M(t), boing(), 0.8, 0, 0.2));
CUE.SAD.forEach((t) => put("fx", M(t), sadTrombone(), 0.8, 0, 0.3));
CUE.DING.forEach((t) => put("fx", M(t), bell(hzM(88), 1.2), 0.45, 0.2, 0.4));
CUE.CONFETTI.forEach((t) => put("fx", M(t), confetti(), 0.9, 0, 0.4));
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
  const t = i / SR, fadeOut = t > DUR - 0.8 ? Math.max(0, (DUR - t) / 0.8) : 1;
  const l = bus.drums[0][i] * 0.9 + bus.music[0][i] + bus.fx[0][i] + RL[i];
  const r = bus.drums[1][i] * 0.9 + bus.music[1][i] + bus.fx[1][i] + RR[i];
  L[i] = Math.tanh(l * 0.9) * fadeOut; R[i] = Math.tanh(r * 0.9) * fadeOut;
}
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.89 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); out.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
writeFileSync(new URL("../public/brand/sound.wav", import.meta.url), out);
console.log("wrote public/brand/sound.wav, gain", g.toFixed(2));
