// Soundtrack for "Get found locally": 128 BPM, 16 bars = exactly 30 s.
// Act I is a lo-fi vintage band heard through an old speaker; the filter opens into
// an electronic Act II, a breakdown for the honest FAQ, a build, and the landing.
import { writeFileSync } from "node:fs";

const SR = 48000, DUR = 30, N = SR * DUR;
const BPM = 128, BEAT = 60 / BPM;
const T = (b) => b * BEAT;
let seed = 2026;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mk = () => [new Float32Array(N), new Float32Array(N)];
const bus = { vintage: mk(), drums: mk(), music: mk(), fx: mk(), send: mk() };
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


// ---------- vintage instruments ----------
function rhodes(freqs, len) {
  let o = new Float32Array(Math.round(len * SR));
  freqs.forEach((f) => {
    o = add(o, mul(sine(len, (t) => f * (1 + 0.003 * Math.sin(t * 2 * Math.PI * 5))), (t) => Math.exp(-t * 1.6)), 0.3);
    o = add(o, mul(sine(len, f * 2), (t) => Math.exp(-t * 4)), 0.12);
    o = add(o, mul(sine(len, f * 3.01), (t) => Math.exp(-t * 9)), 0.06);
  });
  return mul(o, (t) => Math.min(1, t / 0.004) * (0.85 + 0.15 * Math.sin(t * 2 * Math.PI * 4.5)) * (t > len - 0.08 ? Math.max(0, (len - t) / 0.08) : 1));
}
function upright(f, len = 0.42) { return mul(add(sine(len, (t) => f * (1 + 0.02 * Math.exp(-t * 30))), sine(len, f * 2), 0.25), (t) => Math.min(1, t / 0.004) * Math.exp(-t * 5.5) * 0.9); }
function brush(amp = 1) { return mul(filt(filt(noise(0.28), "lp", 4200), "hp", 700), (t) => (Math.min(1, t / 0.015)) * Math.exp(-t * 11) * 0.7 * amp); }
function softKick() { return mul(sine(0.3, (t) => 48 + 70 * Math.exp(-t * 28)), (t) => Math.exp(-t * 11) * 0.85); }
function beep() { return mul(sine(0.2, 1000), (t) => Math.min(1, t / 0.003) * (t < 0.17 ? 1 : Math.max(0, (0.2 - t) / 0.03)) * 0.45); }
function clunk() { return add(mul(filt(noise(0.25), "lp", 900), (t) => Math.exp(-t * 18) * 0.9), mul(sine(0.25, (t) => 70 * Math.exp(-t * 4) + 30), (t) => Math.exp(-t * 12) * 0.7)); }
function typeKey() { return add(mul(filt(noise(0.04), "bp", 2600, 2), (t) => Math.exp(-t * 160) * 0.9), mul(sine(0.03, 180), (t) => Math.exp(-t * 120) * 0.4)); }
function ding() { return mul(add(sine(0.9, 2093), sine(0.9, 2793), 0.5), (t) => Math.exp(-t * 4) * 0.25); }
function scribble(len) { return mul(filt(noise(len), "bp", (t) => 1800 + 900 * Math.sin(t * 40), 3), (t) => (0.5 + 0.5 * Math.sin(t * 55)) * Math.sin(Math.PI * t / len) * 0.5); }
function softKey() { return mul(filt(noise(0.03), "bp", 3800, 1.5), (t) => Math.exp(-t * 220) * 0.5); }
function ping(f) { return mul(add(sine(1.8, f), sine(1.8, f * 2.01), 0.2), (t) => Math.min(1, t / 0.002) * Math.exp(-t * 2.6) * 0.4); }
function heartbeat() { return mul(sine(0.3, (t) => 40 + 30 * Math.exp(-t * 20)), (t) => Math.exp(-t * 14) * 1.0); }

const hzm = (m) => 440 * Math.pow(2, (m - 69) / 12);

// =================== ACT I — vintage (beats 0–16) ===================
// countdown 3-2-1, projector clunk, film flash
put("vintage", T(0), clunk(), 0.9);
[0, 1, 2].forEach((b) => put("vintage", T(b), beep(), 0.6));
put("vintage", T(3), mul(filt(noise(0.5), "hp", 1500), (t) => Math.exp(-t * 7) * 0.6), 0.6);
// lo-fi groove from beat 3.5
const VCH = [
  [4, 8, [57, 60, 64, 67], 45], [8, 12, [53, 57, 60, 64], 41], [12, 14, [50, 53, 57, 60], 38], [14, 16, [52, 56, 59, 62], 40],
];
put("vintage", T(3), rhodes([57, 60, 64, 67].map(hzm), T(1)), 0.5);
VCH.forEach(([b0, b1, ch, root]) => {
  for (let b = b0; b < b1; b++) {
    const inBar = b % 4;
    if (inBar === 0 || inBar === 2) put("vintage", T(b), softKick(), 0.8);
    if (inBar === 1 || inBar === 3) put("vintage", T(b), brush(), 0.7, 0.2);
    put("vintage", T(b + 0.5), brush(0.35), 0.5, -0.2);
    const walk = [root, root + 7, root + 12, root + (inBar === 3 ? 11 : 7)][inBar];
    put("vintage", T(b), upright(hzm(walk)), 0.75);
  }
  for (let b = b0; b < b1; b += 2) { put("vintage", T(b), rhodes(ch.map(hzm), T(1.4)), 0.5); put("vintage", T(b + 1.5), rhodes(ch.map(hzm), T(0.5)), 0.32); }
});
// typewriter: "ONCE, THEY FOUND YOU IN THE PHONE BOOK." (b4.3) and "THEN THEY ASKED FOR DIRECTIONS." (b8.3)
for (let i = 0; i < 36; i++) put("vintage", T(4.3 + i * 0.06), typeKey(), 0.55, (i % 5 - 2) * 0.15);
put("vintage", T(4.3 + 36 * 0.06), ding(), 0.5);
for (let i = 0; i < 29; i++) put("vintage", T(8.3 + i * 0.06), typeKey(), 0.55, (i % 5 - 2) * 0.15);
put("vintage", T(8.3 + 29 * 0.06), ding(), 0.5);
put("vintage", T(6.3), scribble(T(1.2)), 0.7);       // red pencil circles the listing
put("vintage", T(9.6), scribble(T(1.6)), 0.45);      // ink route on the map
// search bar: soft keys "PLUMBER NEAR ME" (b12.6)
for (let i = 0; i < 15; i++) put("fx", T(12.6 + i * 0.075), softKey(), 0.5);
// projector clatter + crackle bed over act I
{
  const [L, R] = bus.vintage, end = Math.round(T(15) * SR);
  for (let i = 0; i < end; i++) {
    const t = i / SR, clat = (Math.sin(2 * Math.PI * 24 * t) > 0.92 ? 1 : 0) * rnd() * 0.05;
    const crack = Math.abs(rnd()) > 0.9993 ? rnd() * 0.5 : 0, hiss = rnd() * 0.012;
    const fade = t > T(13) ? Math.max(0, 1 - (t - T(13)) / T(2)) : 1;
    L[i] += (clat + crack + hiss) * fade; R[i] += (clat * 0.8 + crack + hiss) * fade;
  }
}
// the turn: riser + digital power-up into the drop
put("fx", T(13), riser(T(3)), 0.65, 0, 0.3);
put("fx", T(14), mul(filt(saw(T(2), (t) => 120 * Math.pow(10, t / T(2))), "lp", 4000), (t) => Math.pow(t / T(2), 2) * 0.25), 1, 0, 0.3);

// =================== ACT II — digital (beats 16–56) ===================
const CH = { Am: [57, 60, 64], F: [53, 57, 60], C: [55, 60, 64], G: [55, 59, 62], Dm: [57, 62, 65], E: [56, 59, 64] };
const ROOT = { Am: 45, F: 41, C: 48, G: 43, Dm: 50, E: 40 };
const PROG = ["Am", "F", "C", "G", "Am", "F", "C", "G"]; // bars 5–12
const chordAt = (b) => (b < 48 ? PROG[Math.floor((b - 16) / 4)] : b < 52 ? "F" : b < 54 ? "Dm" : "E");
const kicks = [];
const K = (b, amp = 1) => { kicks.push(T(b)); put("drums", T(b), kick(amp), 0.95); };

put("fx", T(16), impact(), 0.95, 0, 0.2);
put("fx", T(16), crash(), 0.7, 0, 0.3);
put("music", T(16), stab(CH.Am.map(hz).map((f) => f * 2), 0.8, 7000), 0.5, 0, 0.4);
for (let b = 16; b < 48; b++) {
  K(b);
  if (b % 2) put("drums", T(b), clap(), 0.5, 0, 0.18);
  for (let s = 0; s < 4; s++) {
    const t = T(b + s / 4);
    put("drums", t, hat(s === 2, s === 2 ? 0.55 : (s % 2 ? 0.45 : 0.28)), 0.45, s % 2 ? 0.25 : -0.15);
    if (s > 0 && b >= 18) put("music", t, bass(hz(ROOT[chordAt(b)]), BEAT / 4 * 0.92), s === 2 ? 0.48 : 0.38);
    if (b >= 24) put("music", t, pluck(hz(CH[chordAt(b)][(b * 4 + s) % 3] + 24)), 0.18, s % 2 ? 0.4 : -0.4, 0.35);
  }
}
for (let bar = 4; bar < 12; bar++) put("music", T(bar * 4), pad(CH[PROG[bar - 4]].map(hz), T(4) + 0.1), 0.4, 0, 0.3);
// near-me sonar pings over the city
[16, 18, 20, 22].forEach((b, i) => put("fx", T(b), ping(1175 + i * 60), 0.55, i % 2 ? 0.4 : -0.4, 0.6));
// six feature panels: whoosh + blip on each arrival
for (let i = 0; i < 6; i++) {
  const len = 0.35, w = mul(filt(noise(len), "bp", (t) => 600 + 4000 * t / len, 1.2), (t) => Math.sin(Math.PI * t / len) * 0.5);
  put("fx", T(24 + i * 2) - 0.12, w, 0.45, i % 2 ? 0.5 : -0.5);
  put("fx", T(24 + i * 2), blip(hz(84 + (i % 3) * 3)), 0.55, 0, 0.4);
}
// how it works: a blip per node; roles: seven blips
[36, 37, 38, 39].forEach((b, i) => put("fx", T(b), blip(hz(76 + i * 3)), 0.6, 0, 0.4));
[0, 1, 2, 3, 4, 5, 6].forEach((i) => put("fx", T(40 + i * 0.5), tick(1500 + i * 160), 0.5, (i - 3) * 0.15, 0.2));
// packages
put("music", T(44), stab(CH.Am.map(hz).map((f) => f * 2), 0.5, 6000), 0.4, 0, 0.4);
put("fx", T(46), bell(hz(88), 1.2), 0.5, 0.2, 0.4);
// breakdown (beats 48–52): drums out, filtered pad, heartbeat, one bell on the answer
put("music", T(48), pad(CH.F.map(hz), T(4) + 0.2, (t) => 500 + 250 * t), 0.55, 0, 0.5);
[48, 48.4, 50, 50.4].forEach((b, i) => put("drums", T(b), heartbeat(), i % 2 ? 0.55 : 0.8));
put("music", T(49.5), bell(hz(81), 2.4), 0.55, 0, 0.6);
// build (beats 52–56)
K(52); K(53); K(54); K(54.5); K(55, 0.9); K(55.25, 0.8);
for (let b = 52; b < 55.5; b += b < 54 ? 0.5 : b < 55 ? 0.25 : 0.125) put("drums", T(b), snare(0.35 + (b - 52) * 0.2), 0.7, 0, 0.2);
put("fx", T(52), riser(T(3.5)), 0.8, 0, 0.25);
put("music", T(52), pad(CH.Dm.map(hz), T(2) + 0.1, (t) => 600 + 3000 * t), 0.5, 0, 0.3);
put("music", T(54), pad(CH.E.map(hz), T(1.5) + 0.05, (t) => 1800 + 6000 * t), 0.5, 0, 0.3);

// =================== ACT III — land (beats 56–64) ===================
K(56, 1.1);
put("fx", T(56), impact(), 1, 0, 0.2);
put("fx", T(56), crash(), 0.85, 0, 0.35);
put("music", T(56), stab(CH.Am.map(hz).map((f) => f * 2), 1.8, 8000), 0.6, 0, 0.5);
put("music", T(56), pad([45, ...CH.Am, 72].map(hz), 30 - T(56), (t) => 2600 * Math.exp(-t * 0.6) + 400), 0.5, 0, 0.4);
put("music", T(56), bell(hz(81)), 0.8, 0.2, 0.5);
put("music", T(57.5), bell(hz(76), 2.2), 0.4, -0.3, 0.6);
put("music", T(59), bell(hz(84), 2.2), 0.3, 0.3, 0.6);

// ---------- old-speaker filter on act I, opening across the turn ----------
{
  const open = (t) => (t < T(12) ? 3000 : t < T(16) ? 3000 * Math.pow(6, (t - T(12)) / T(4)) : 18000);
  bus.vintage.forEach((ch) => { filt(ch, "lp", open, 0.9); filt(ch, "hp", (t) => (t < T(14) ? 140 : 40), 0.7); });
}
// sidechain duck
const duck = new Float32Array(N).fill(1);
kicks.forEach((tk) => { const s = Math.round(tk * SR); for (let i = 0; i < SR * 0.4 && s + i < N; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.6 * Math.exp(-(i / SR) * 10)); });
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
  const t = i / SR, fadeOut = t > 29.1 ? Math.max(0, (30 - t) / 0.9) : 1;
  const l = bus.vintage[0][i] * 1.7 + bus.drums[0][i] + bus.music[0][i] * duck[i] + bus.fx[0][i] + RL[i] * 1.1;
  const r = bus.vintage[1][i] * 1.7 + bus.drums[1][i] + bus.music[1][i] * duck[i] + bus.fx[1][i] + RR[i] * 1.1;
  L[i] = Math.tanh(l * 0.9) * fadeOut; R[i] = Math.tanh(r * 0.9) * fadeOut;
}
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.89 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); out.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
writeFileSync(new URL("../public/local.wav", import.meta.url), out);
console.log("wrote public/local.wav, gain", g.toFixed(2));
