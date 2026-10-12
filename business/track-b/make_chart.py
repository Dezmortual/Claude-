# Builds the before/after win-rate chart from the numbers in the Sweep and Donchian READMEs.
import sys
out = sys.argv[1]
W, H = 1200, 675
X0, X1 = 360, 960
sx = lambda v: X0 + (X1 - X0) * v / 100
SHOWN, REAL = "#eb6834", "#2a78d6"
T1, T2, T3, GRID, SURF = "#0b0b0b", "#52514e", "#7a7974", "#e4e3df", "#fcfcfb"
groups = [
    ("Sweep", "hourly crypto, 10 coins", [
        ("TradingView shows", 78.0, "+0.52% per trade", "69,442 trades", SHOWN),
        ("Honest fills", 38.3, "−0.13% per trade, loses money", "69,442 trades", REAL)]),
    ("SOL Donchian", "daily crypto, BTC ETH SOL", [
        ("TradingView shows", 93.2, "+0.65 R per trade", "381 trades", SHOWN),
        ("Honest fills", 53.1, "+0.13 R per trade, no edge after 2025", "335 trades", REAL)]),
]
def bar(x, y, w, h, c):
    r = 4
    return (f'<path d="M{x},{y} H{x+w-r} Q{x+w},{y} {x+w},{y+r} V{y+h-r} '
            f'Q{x+w},{y+h} {x+w-r},{y+h} H{x} Z" fill="{c}"/>')
s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
     f'font-family="Inter, Helvetica, Arial, sans-serif">',
     f'<rect width="{W}" height="{H}" fill="{SURF}"/>',
     f'<text x="60" y="78" font-size="34" font-weight="700" fill="{T1}">Same rules. Only the fill model changed.</text>',
     f'<text x="60" y="116" font-size="20" fill="{T2}">Win rate with the tester’s same-bar trailing-stop fill vs the same strategy re-tested with honest fills</text>']
# legend
lx = 60
for name, c in [("TradingView’s same-bar assumption (no Bar Magnifier)", SHOWN), ("Honest fills", REAL)]:
    s.append(f'<rect x="{lx}" y="140" width="14" height="14" rx="3" fill="{c}"/>')
    s.append(f'<text x="{lx+22}" y="153" font-size="16" fill="{T2}">{name}</text>')
    lx += 22 + len(name) * 8.4 + 30
top, bottom = 200, 560
for v in (0, 25, 50, 75, 100):
    x = sx(v)
    s.append(f'<line x1="{x}" y1="{top-8}" x2="{x}" y2="{bottom}" stroke="{GRID}" stroke-width="1"/>')
    s.append(f'<text x="{x}" y="{bottom+24}" font-size="14" fill="{T3}" text-anchor="middle">{v}%</text>')
y = top + 10
BH, GAP = 46, 2
for title, sub, rows in groups:
    s.append(f'<text x="60" y="{y+BH-4}" font-size="22" font-weight="700" fill="{T1}">{title}</text>')
    s.append(f'<text x="60" y="{y+BH+20}" font-size="15" fill="{T2}">{sub}</text>')
    for i, (lab, v, net, n, c) in enumerate(rows):
        by = y + i * (BH + GAP)
        s.append(bar(X0, by, sx(v) - X0, BH, c))
        s.append(f'<text x="{sx(v)+10}" y="{by+21}" font-size="20" font-weight="700" fill="{T1}">{v:.0f}%</text>')
        s.append(f'<text x="{sx(v)+10}" y="{by+40}" font-size="14" fill="{T2}">{net} · {n}</text>')
    y += 2 * BH + GAP + 92
s.append(f'<line x1="{X0}" y1="{top-8}" x2="{X0}" y2="{bottom}" stroke="{T3}" stroke-width="1"/>')
s.append(f'<text x="60" y="{H-22}" font-size="13" fill="{T3}">Costs: 0.05% commission + 2 bps slippage per side. Every trade re-checked against the rules as written. '
         f'Win rate alone is not edge: see the net result under each bar.</text>')
s.append('</svg>')
open(out, "w").write("\n".join(s))
