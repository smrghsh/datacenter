#!/usr/bin/env python3
"""Fetch submarine cable routes + landing points and emit static/data/cables.json.

Source: TeleGeography submarinecablemap.com data, via the GitHub mirror
github.com/lintaojlu/submarine_cable_information (web/public/api/v3/...).

Output format (coordinates are [lat, lng], WGS84 degrees):
  {
    "attribution": "...",
    "cables":   [{"name": "...", "paths": [[[lat,lng], ...], ...]}, ...],
    "landings": [{"name": "...", "lat": .., "lng": ..}, ...]
  }

Cable polylines are simplified with Douglas-Peucker and split at the
antimeridian (any consecutive-point longitude jump > 180 deg) so a renderer
never draws a chord across the whole globe.

Stdlib only. Usage:  python3 scripts/fetch_cables.py
"""

import json
import math
import os
import urllib.request

BASE = ("https://raw.githubusercontent.com/lintaojlu/"
        "submarine_cable_information/master/web/public/api/v3")
CABLE_URL = f"{BASE}/cable/cable-geo.json"
LANDING_URL = f"{BASE}/landing-point/landing-point-geo.json"

# Douglas-Peucker tolerance, in degrees.
TOLERANCE_DEG = 0.05
# Decimal places kept in the output (0.001 deg is roughly 110 m).
PRECISION = 3

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(REPO_ROOT, "static", "data", "cables.json")

ATTRIBUTION = ("Submarine cable data © TeleGeography "
               "(CC BY-NC-SA 3.0), via submarinecablemap.com")


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cable-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def perpendicular_distance(pt, a, b):
    """Distance from pt to segment a-b (all (lng, lat) tuples, planar degrees)."""
    ax, ay = a
    bx, by = b
    px, py = pt
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def douglas_peucker(points, tolerance):
    """Iterative Douglas-Peucker on a list of (lng, lat) tuples."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        max_dist = 0.0
        index = -1
        for i in range(start + 1, end):
            d = perpendicular_distance(points[i], points[start], points[end])
            if d > max_dist:
                max_dist = d
                index = i
        if max_dist > tolerance:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))
    return [p for p, k in zip(points, keep) if k]


def split_antimeridian(points):
    """Split a (lng, lat) polyline wherever consecutive lngs jump > 180 deg."""
    segments = []
    current = [points[0]]
    for prev, cur in zip(points, points[1:]):
        if abs(cur[0] - prev[0]) > 180.0:
            if len(current) >= 2:
                segments.append(current)
            current = [cur]
        else:
            current.append(cur)
    if len(current) >= 2:
        segments.append(current)
    return segments


def build_cables(cable_geo):
    """FeatureCollection -> {name: [path, ...]} with [lat, lng] points."""
    cables = {}
    for feature in cable_geo.get("features", []):
        geom = feature.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if not coords:
            continue  # drop cables with no geometry
        if geom.get("type") == "LineString":
            coords = [coords]
        elif geom.get("type") != "MultiLineString":
            continue
        name = feature.get("properties", {}).get("name") or "Unknown"
        paths = cables.setdefault(name, [])
        for line in coords:
            pts = [(float(lng), float(lat)) for lng, lat, *_ in line]
            if len(pts) < 2:
                continue
            for segment in split_antimeridian(pts):
                simplified = douglas_peucker(segment, TOLERANCE_DEG)
                if len(simplified) < 2:
                    continue
                paths.append([[round(lat, PRECISION), round(lng, PRECISION)]
                              for lng, lat in simplified])
    return {name: paths for name, paths in cables.items() if paths}


def build_landings(landing_geo):
    """FeatureCollection of Points -> deduped landing list."""
    landings = []
    seen = set()
    for feature in landing_geo.get("features", []):
        geom = feature.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if geom.get("type") != "Point" or len(coords) < 2:
            continue
        lng, lat = float(coords[0]), float(coords[1])
        lat_r, lng_r = round(lat, PRECISION), round(lng, PRECISION)
        key = (lat_r, lng_r)
        if key in seen:
            continue  # deduplicate by rounded coordinate
        seen.add(key)
        name = feature.get("properties", {}).get("name") or "Unknown"
        landings.append({"name": name, "lat": lat_r, "lng": lng_r})
    return landings


def main():
    print(f"Fetching {CABLE_URL}")
    cable_geo = fetch_json(CABLE_URL)
    print(f"Fetching {LANDING_URL}")
    landing_geo = fetch_json(LANDING_URL)

    cables = build_cables(cable_geo)
    landings = build_landings(landing_geo)

    out = {
        "attribution": ATTRIBUTION,
        "cables": [{"name": name, "paths": paths}
                   for name, paths in sorted(cables.items())],
        "landings": landings,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    n_points = sum(len(p) for c in out["cables"] for p in c["paths"])
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"Wrote {OUT_PATH}")
    print(f"  cables: {len(out['cables'])}  paths: "
          f"{sum(len(c['paths']) for c in out['cables'])}  points: {n_points}")
    print(f"  landings: {len(landings)} (from "
          f"{len(landing_geo.get('features', []))} raw)")
    print(f"  size: {size_kb:.0f} KB  (tolerance {TOLERANCE_DEG} deg)")


if __name__ == "__main__":
    main()
