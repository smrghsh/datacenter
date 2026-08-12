#!/usr/bin/env python3
"""Generate GitHub-globe-style land dot matrix.

Rasterize Natural Earth 50m land polygons (equirectangular) with PIL, then
sample a Fibonacci sphere (equal-area, no pole clustering) and keep points
that fall on land. Output: static/data/land.bin — Int16 pairs of
(lat*100, lng*100), little-endian.
"""
import json, math, struct
from PIL import Image, ImageDraw

SCRATCH = "/private/tmp/claude-501/-Users-vertex-code-datacenter-globe/d8a61834-bebc-4ac2-9988-68943c99bb69/scratchpad"
ROOT = "/Users/vertex/code/datacenter-globe"

W, H = 8192, 4096
img = Image.new("1", (W, H), 0)
draw = ImageDraw.Draw(img)

gj = json.load(open(f"{SCRATCH}/ne_land.json", encoding="utf-8"))

def to_px(lon, lat):
    return ((lon + 180.0) / 360.0 * W, (90.0 - lat) / 180.0 * H)

for feat in gj["features"]:
    geom = feat["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        outer = [to_px(x, y) for x, y in poly[0]]
        if len(outer) >= 3:
            draw.polygon(outer, fill=1)
        for hole in poly[1:]:
            pts = [to_px(x, y) for x, y in hole]
            if len(pts) >= 3:
                draw.polygon(pts, fill=0)

px = img.load()

N = 62000  # candidates on the full sphere -> ~18k on land
GA = math.pi * (3.0 - math.sqrt(5.0))
out = []
for i in range(N):
    y = 1.0 - (i / (N - 1)) * 2.0          # 1 .. -1
    lat = math.degrees(math.asin(y))
    lon = math.degrees((GA * i) % (2.0 * math.pi)) - 180.0
    if lat < -85.0:  # skip Antarctica's very-bottom cap distortion; keep coast
        pass
    x, yy = to_px(lon, lat)
    xi, yi = int(x) % W, min(H - 1, max(0, int(yy)))
    if px[xi, yi]:
        out.append((int(round(lat * 100)), int(round(lon * 100))))

with open(f"{ROOT}/static/data/land.bin", "wb") as f:
    f.write(struct.pack(f"<{len(out)*2}h", *[v for p in out for v in p]))
print(f"land dots: {len(out)}  ({len(out)*4/1024:.0f} KB)")
