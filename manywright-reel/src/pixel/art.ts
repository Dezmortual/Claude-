// Hand-made pixel assets: a 5x7 bitmap font, 12x12 service icons, and the "wright" sprite.

export type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const P = {
  navy: hex("#0F1B2D"), deep: hex("#08111D"), ice: hex("#F4F6FA"), amber: hex("#F5A524"),
  coral: hex("#E8775E"), cobalt: hex("#2E5BFF"), muted: hex("#8EA7BB"), dim: hex("#3A5068"), soft: hex("#B9C6D3"),
};
export const BRAND: RGB[] = [P.amber, P.coral, P.ice, P.cobalt];
const KEY: Record<string, RGB> = { w: P.ice, a: P.amber, c: P.coral, b: P.cobalt, m: P.muted, n: P.navy, d: P.dim };

// ---- 5x7 font (rows top→bottom, 5 bits each)
const G: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110", D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11111 00010 00100 00010 00001 10001 01110",
  "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
  ".": "00000 00000 00000 00000 00000 01100 01100", ",": "00000 00000 00000 00000 01100 00100 01000",
  "/": "00000 00001 00010 00100 01000 10000 00000", ":": "00000 01100 01100 00000 01100 01100 00000",
  $: "00100 01111 10100 01110 00101 11110 00100", ">": "01000 00100 00010 00001 00010 00100 01000",
  _: "00000 00000 00000 00000 00000 00000 11111", "-": "00000 00000 00000 11111 00000 00000 00000",
  "+": "00000 00100 00100 11111 00100 00100 00000", "·": "00000 00000 00000 00100 00000 00000 00000",
  "!": "00100 00100 00100 00100 00100 00000 00100", "✓": "00000 00001 00001 00010 10100 01000 00000", "*": "00000 10101 01110 11111 01110 10101 00000", " ": "00000 00000 00000 00000 00000 00000 00000",
};
export const glyph = (ch: string): string[] => (G[ch.toUpperCase()] || G[" "]).split(" ");
export const textWidth = (s: string, sc: number) => s.length * 6 * sc - sc;
// every lit pixel of a string, top-left at (x, y)
export const textPixels = (s: string, x: number, y: number, sc: number) => {
  const out: [number, number][] = [];
  [...s].forEach((ch, k) => glyph(ch).forEach((row, r) => [...row].forEach((bit, c) => {
    if (bit === "1") out.push([x + (k * 6 + c) * sc, y + r * sc]);
  })));
  return out;
};

// ---- 12x12 service icons
const ICON_ROWS: Record<string, string[]> = {
  web: ["mmmmmmmmmmmm", "mcmamwmmmmmm", "mmmmmmmmmmmm", "m..........m", "m.aaaaaa...m", "m..........m", "m.wwww.bbb.m", "m.wwww.bbb.m", "m.wwww.bbb.m", "m..........m", "m.wwwwwwww.m", "mmmmmmmmmmmm"],
  pin: ["....aaaa....", "...aaaaaa...", "..aaawwaaa..", "..aawwwwaa..", "..aawwwwaa..", "..aaawwaaa..", "...aaaaaa...", "....aaaa....", ".....aa.....", ".....aa.....", "...mmmmmm...", "..mmmmmmmm.."],
  chat: ["............", ".wwwwwwwwww.", "wwwccwccwwww", "wwcccccccwww", "wwcccccccwww", "wwwcccccwwww", "wwwwcccwwwww", "wwwwwcwwwwww", ".wwwwwwwwww.", "..ww........", ".w..........", "............"],
  coins: ["............", "............", "........aaaa", "........mmmm", "....aaaaaaaa", "....mmmmmmmm", "aaaaaaaaaaaa", "mmmmmmmmmmmm", "aaaaaaaaaaaa", "mmmmmmmmmmmm", "aaaaaaaaaaaa", "mmmmmmmmmmmm"],
  mail: ["............", "............", "wwwwwwwwwwww", "wbwwwwwwwwbw", "wwbwwwwwwbww", "wwwbwwwwbwww", "wwwwbwwbwwww", "wwwwwbbwwwww", "wwwwwwwwwwww", "wwwwwwwwwwww", "wwwwwwwwwwww", "............"],
  cal: ["..m......m..", "cccccccccccc", "cccccccccccc", "wwwwwwwwwwww", "wmwmwmwmwmww", "wwwwwwwwwwww", "wmwmwawmwmww", "wwwwwwwwwwww", "wmwmwmwmwmww", "wwwwwwwwwwww", "wwwwwwwwwwww", "............"],
  gem: ["............", "...wwwwww...", "..wawwwwaw..", ".wwwwwwwwww.", "aaaaaaaaaaaa", ".aaaaaaaaaa.", "..aaaaaaaa..", "...aaaaaa...", "....aaaa....", ".....aa.....", "............", "............"],
  phone: ["..mmmmmmmm..", "..mbbbbbbm..", "..mwwwwwwm..", "..mwaaaawm..", "..mwwwwwwm..", "..mwmmmmwm..", "..mwwwwwwm..", "..mwaaaawm..", "..mwwwwwwm..", "..mmmmmmmm..", "..mmmwwmmm..", "..mmmmmmmm.."],
  doc: ["wwwwwwww....", "wmmmmmmw....", "wwwwwwww..aa", "wmmmmmmw.aaa", "wwwwwww.aaa.", "wmmmmm.aaa..", "wwwww.aaa...", "wmmm.aaa....", "wwww.ca.....", "wmmmcc......", "wwwwwwww....", "............"],
  call: ["............", ".aaa........", ".aaaa.......", ".aaa........", "..aa........", "..aaa.......", "...aaa......", "....aaa..aa.", ".....aaaaaaa", "......aaaaa.", "........aa..", "............"],
  bolt: [".......aaa..", "......aaa...", ".....aaa....", "....aaa.....", "...aaaaaaa..", "..aaaaaaa...", ".....aaa....", "....aaa.....", "...aaa......", "..aaa.......", ".aa.........", "............"],
  key: ["............", "............", "............", ".aaaa.......", "aa..aa......", "aa..aaaaaaaa", "aa..aa..a.a.", ".aaaa...a.a.", "............", "............", "............", "............"],
  shield: [".bbbbbbbbbb.", "bbbbbbbbbbbb", "bbbbbbbbbbbb", "bbbbbbbbbwbb", "bbbbbbbbwwbb", "bwbbbbbwwbbb", "bwwbbbwwbbbb", ".bwwbwwbbbb.", ".bbwwwbbbbb.", "..bbwbbbbb..", "...bbbbbb...", ".....bb....."],
};
export const SERVICES: { icon: string; name: string; price: string }[] = [
  { icon: "web", name: "WEBSITES", price: "FROM $3,500" },
  { icon: "pin", name: "LOCAL SEARCH", price: "FROM $549/MO" },
  { icon: "chat", name: "SOCIAL + EMAIL", price: "FROM $995/MO" },
  { icon: "coins", name: "BOOKKEEPING", price: "FROM $495/MO" },
  { icon: "mail", name: "CUSTOMER INBOX", price: "FROM $450/MO" },
  { icon: "cal", name: "BOOKINGS", price: "FROM $1,000" },
  { icon: "gem", name: "BRAND", price: "FROM $1,250" },
  { icon: "shield", name: "SECURITY", price: "FROM $1,750" },
];
export const iconPixels = (name: string): { x: number; y: number; c: RGB }[] => {
  const out: { x: number; y: number; c: RGB }[] = [];
  ICON_ROWS[name].forEach((row, y) => [...row].forEach((ch, x) => { if (KEY[ch]) out.push({ x, y, c: KEY[ch] }); }));
  return out;
};

// ---- the wright: 8x10, two walk frames + a jump frame
const WRIGHT_ROWS = {
  a: ["..aaaa..", ".aaaaaa.", "..wwww..", "..wnwn..", "..wwww..", ".bbbbbb.", "w.bbbb.w", "..bbbb..", "..m..m..", ".mm..mm."],
  b: ["..aaaa..", ".aaaaaa.", "..wwww..", "..wnwn..", "..wwww..", ".bbbbbb.", "w.bbbb.w", "..bbbb..", "...mm...", "..m..m.."],
  jump: ["..aaaa..", ".aaaaaa.", "..wwww..", "..wnwn..", "w.wwww.w", "wbbbbbbw", "..bbbb..", "..bbbb..", ".m....m.", "m......m"],
};
export const sprite = (frame: keyof typeof WRIGHT_ROWS) => {
  const out: { x: number; y: number; c: RGB }[] = [];
  WRIGHT_ROWS[frame].forEach((row, y) => [...row].forEach((ch, x) => { if (KEY[ch]) out.push({ x, y, c: KEY[ch] }); }));
  return out;
};

// ---- the Manywright M (same geometry as src/lib.tsx), rasterised to points
const M_POLYS: { pts: number[][]; amber: boolean }[] = [
  { pts: [[122, 168], [170, 249], [170, 363], [122, 363]], amber: false },
  { pts: [[122, 148], [178, 148], [252, 274], [252, 363], [249, 363]], amber: false },
  { pts: [[389, 148], [333, 148], [259, 276], [259, 363], [262, 363]], amber: true },
  { pts: [[389, 168], [341, 249], [341, 363], [389, 363]], amber: false },
];
const inside = (x: number, y: number, poly: number[][]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
// points of the M at `height` logical px, centred on (cx, cy), sampled every `step` px
export const mPixels = (cx: number, cy: number, height: number, step: number) => {
  const sc = height / 215, out: { x: number; y: number; c: RGB; piece: number }[] = [];
  const w = 267 * sc;
  for (let py = 0; py < height; py += step) for (let px = 0; px < w; px += step) {
    const ux = 122 + (px + step / 2) / sc, uy = 148 + (py + step / 2) / sc;
    M_POLYS.forEach((p, k) => { if (inside(ux, uy, p.pts)) out.push({ x: cx - w / 2 + px, y: cy - height / 2 + py, c: p.amber ? P.amber : P.ice, piece: k }); });
  }
  return out;
};
