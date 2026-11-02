"""Builds landing.html (self-contained Gumroad landing page) from build/landing.template.html."""
import base64, io, os
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(H)
t = open(os.path.join(H, "landing.template.html")).read()
c = open(os.path.join(H, "cover-funny.html")).read()
svg = c[c.index('<svg class="scene"'):c.index("</svg>") + 6]
svg = svg.replace('<svg class="scene" viewBox="0 0 760 720" xmlns="http://www.w3.org/2000/svg">',
                  '<svg viewBox="0 40 760 600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">')
svg = svg.replace('<defs>\n      <marker id="none"/>\n    </defs>\n', '')
svg = svg.replace("<!-- ===== FREELANCER (chasing, running right) ===== -->\n    <g ", '<g class="runner" ', 1)
svg = svg.replace("<!-- ===== INVOICE (running away, right) ===== -->\n    <g ", '<g class="runner2" ', 1)
svg = svg.replace('class="bub"', 'font-family="Poppins,system-ui,sans-serif" font-weight="800"')
im = Image.open(os.path.join(R, "sell/img/app-screenshot.png")).convert("RGB")
im = im.resize((1200, round(im.height * 1200 / im.width)))
buf = io.BytesIO(); im.save(buf, "WEBP", quality=82)
uri = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
out = t.replace("{{SCENE_SVG}}", svg).replace("{{APP_IMG}}", uri)
assert "{{" not in out
open(os.path.join(R, "landing.html"), "w").write(out)
print("landing.html", round(len(out) / 1024), "KB")
