"""Builds the FXDEZ logo as SVG: the FX monogram (gold F, emerald X) under rising candles and an up-trend arrow,
on deep navy. Every shape is a path, so it renders the same everywhere without fonts. Run: python3 build.py"""
import pathlib

OUT = pathlib.Path(__file__).parent

DEFS = """
<defs>
  <radialGradient id="bg" cx="50%" cy="36%" r="78%">
    <stop offset="0" stop-color="#1d2944"/><stop offset="0.5" stop-color="#0d1322"/><stop offset="1" stop-color="#04060b"/>
  </radialGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#f5c35a" stop-opacity="0.22"/><stop offset="1" stop-color="#f5c35a" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#fff0bd"/><stop offset="0.35" stop-color="#f2c35b"/><stop offset="0.7" stop-color="#c88c27"/><stop offset="1" stop-color="#8f5b12"/>
  </linearGradient>
  <linearGradient id="goldTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe9"/><stop offset="1" stop-color="#ffd877"/></linearGradient>
  <linearGradient id="green" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#a6ffd9"/><stop offset="0.35" stop-color="#25d98f"/><stop offset="0.7" stop-color="#0d9a62"/><stop offset="1" stop-color="#05573a"/>
  </linearGradient>
  <linearGradient id="greenDeep" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#62f2b6"/><stop offset="0.5" stop-color="#12a06b"/><stop offset="1" stop-color="#065a3b"/>
  </linearGradient>
  <linearGradient id="wordGold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff5cf"/><stop offset="0.42" stop-color="#f3c65f"/><stop offset="0.5" stop-color="#b97d20"/>
    <stop offset="0.75" stop-color="#e9b44a"/><stop offset="1" stop-color="#ffdf8a"/>
  </linearGradient>
  <linearGradient id="stage" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#f3c65f" stop-opacity="0"/><stop offset="0.5" stop-color="#ffe7a0" stop-opacity="0.9"/><stop offset="1" stop-color="#f3c65f" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="greenTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9fff5"/><stop offset="1" stop-color="#6ff3bd"/></linearGradient>
  <linearGradient id="candleG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe7a3"/><stop offset="0.5" stop-color="#e3a840"/><stop offset="1" stop-color="#a86f1a"/></linearGradient>
  <linearGradient id="candleE" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9dffd5"/><stop offset="0.5" stop-color="#1fcf86"/><stop offset="1" stop-color="#0a7d51"/></linearGradient>
  <filter id="lift" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000" flood-opacity="0.6"/>
  </filter>
  <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="6" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 0.2  0 0 0 0 1  0 0 0 0 0.6  0 0 0 0.55 0"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>"""

def candle(x, body_top, body_bot, wick_top, wick_bot, fill, w=17):
    return (f'<rect x="{x + w/2 - 1.75}" y="{wick_top}" width="3.5" height="{wick_bot - wick_top}" rx="1.75" fill="{fill}"/>'
            f'<rect x="{x}" y="{body_top}" width="{w}" height="{body_bot - body_top}" rx="3" fill="{fill}"/>')

def mark():
    """The FX monogram in a 240 x 240 box, leaning forward as one piece."""
    candles = "".join([
        candle(30, 96, 122, 86, 128, "url(#candleG)"), candle(56, 82, 116, 72, 122, "url(#candleG)"),
        candle(82, 70, 108, 58, 114, "url(#candleG)"), candle(108, 60, 98, 46, 104, "url(#candleE)"),
    ])
    # Letters on a common baseline (y 210) and cap line (y 130), 30 units thick.
    F = ('<path d="M30 130 H60 V210 H30 Z"/>'            # stem
         '<path d="M30 130 H120 V156 H30 Z"/>'           # top arm
         '<path d="M30 172 H102 V196 H30 Z"/>')          # middle arm (bar shortened to read as F, not E)
    Ftop = '<path d="M30 130 H120 V137 H30 Z"/>'         # bevel light on the top edge
    # X: the falling stroke, and the rising stroke that carries on into the arrow.
    Xfall = '<path d="M128 130 H162 L222 210 H188 Z"/>'
    # Rising stroke: edges (128,210)-(188,130) and (162,210)-(222,130), carried on along (0.6,-0.8) into an arrow head.
    Xrise = '<path d="M128 210 L212 98 L199.2 88.4 L262 54 L258.8 107.6 L246 98 L162 210 Z"/>'
    Xtop = '<path d="M128 130 H162 L157 137 H133 Z"/>'
    return (f'<g transform="skewX(-12) translate(22 0)">'
            f'<ellipse cx="128" cy="140" rx="130" ry="100" fill="url(#halo)"/>'
            f'<g filter="url(#lift)">{candles}</g>'
            f'<g filter="url(#lift)"><g fill="url(#gold)">{F}</g><g fill="url(#goldTop)" opacity="0.75">{Ftop}</g></g>'
            f'<g filter="url(#lift)"><g fill="url(#greenDeep)">{Xfall}</g>'
            # a thin dark edge on the rising stroke cuts it cleanly over the falling one, so the two read as interlocked
            f'<g filter="url(#glow)" fill="url(#green)" stroke="#070b14" stroke-width="3" paint-order="stroke">{Xrise}</g>'
            f'<g fill="url(#greenTop)" opacity="0.7">{Xtop}</g></g>'
            f'</g>'
            # the gold stage line the monogram stands on, outside the lean
            f'<rect x="14" y="222" width="236" height="3" rx="1.5" fill="url(#stage)"/>')

def wordmark():
    """FXDEZ in a geometric bold, as paths, in a 300 x 60 box."""
    s = 'fill="url(#wordGold)" filter="url(#lift)"'
    F = '<path d="M0 0 H44 V12 H14 V24 H38 V36 H14 V60 H0 Z"/>'
    X = '<path d="M52 0 H68 L80 20 L92 0 H108 L88 30 L108 60 H92 L80 40 L68 60 H52 L72 30 Z"/>'
    D = '<path d="M116 0 H140 A30 30 0 0 1 140 60 H116 Z M130 12 V48 H140 A18 18 0 0 0 140 12 Z" fill-rule="evenodd"/>'
    E = '<path d="M180 0 H224 V12 H194 V24 H218 V36 H194 V48 H224 V60 H180 Z"/>'
    Z = '<path d="M232 0 H280 V12 L250 48 H280 V60 H232 V48 L262 12 H232 Z"/>'
    return f'<g {s}>{F}{X}{D}{E}{Z}</g>'

def svg(body, w=512, h=512, bg=True, rx=112):
    back = f'<rect width="{w}" height="{h}" rx="{rx}" fill="url(#bg)"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{DEFS}{back}{body}</svg>'

# App icon: mark with the wordmark under it.
icon = svg(f'<g transform="translate(88 30) scale(1.2)">{mark()}</g><g transform="translate(116 340)">{wordmark()}</g>')
# Mark only, for small sizes (favicon, header, badge): the monogram filling the tile.
mark_tile = svg(f'<g transform="translate(24 44) scale(1.65)">{mark()}</g>')
# Full-bleed squares for the phone's own icon masks; the maskable one keeps everything inside the safe circle.
icon_square = svg(f'<g transform="translate(88 30) scale(1.2)">{mark()}</g><g transform="translate(116 340)">{wordmark()}</g>', rx=0)
icon_maskable = svg(f'<g transform="translate(51.2 51.2) scale(0.8)"><g transform="translate(88 30) scale(1.2)">{mark()}</g><g transform="translate(116 340)">{wordmark()}</g></g>', rx=0)
# Link preview: monogram and wordmark side by side.
og = (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">{DEFS}<rect width="1200" height="630" fill="url(#bg)"/>'
      f'<g transform="translate(150 140) scale(1.45)">{mark()}</g><g transform="translate(600 285) scale(1.6)">{wordmark()}</g></svg>')
(OUT / "fxdez-icon-square.svg").write_text(icon_square)
(OUT / "fxdez-icon-maskable.svg").write_text(icon_maskable)
(OUT / "fxdez-og.svg").write_text(og)
(OUT / "fxdez-icon.svg").write_text(icon)
(OUT / "fxdez-mark.svg").write_text(mark_tile)
print("wrote", [p.name for p in OUT.glob("*.svg")])
