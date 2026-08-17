#!/usr/bin/env python3
"""Fetch AWS / Azure / GCP cloud region locations into static/data/cloud_regions.json.

Source: https://github.com/jasonwilbur/mcp-server-cloud-regions (MIT License)
  data/regions.json -- provider region lists compiled from the providers'
  published documentation (AWS global infrastructure page, Azure regions list,
  GCP locations page), with city-level coordinates and GA/preview status.

Filtering: providers aws/azure/gcp, status == "ga" only (drops preview /
announced regions). Includes commercial, government, and China sovereign
regions -- all are operating datacenters.

Labels: AWS uses the parenthesized locality from the display name
("US East (N. Virginia)" -> "N. Virginia"); GCP uses the display name (already
a locality); Azure uses the city (display names like "Japan East" are not
localities).

Usage: python3 scripts/fetch_cloud_regions.py
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

SOURCE_URL = (
    "https://raw.githubusercontent.com/jasonwilbur/"
    "mcp-server-cloud-regions/main/data/regions.json"
)
PROVIDERS = ("aws", "azure", "gcp")
OUT_PATH = Path(__file__).resolve().parent.parent / "static" / "data" / "cloud_regions.json"


def make_label(region: dict) -> str:
    provider = region["provider"]
    display = region["displayName"]
    city = region["location"].get("city") or display
    if provider == "aws":
        m = re.search(r"\(([^)]+)\)", display)
        return m.group(1) if m else city
    if provider == "gcp":
        return display
    return city  # azure


def main() -> None:
    with urllib.request.urlopen(SOURCE_URL) as resp:
        data = json.load(resp)

    meta = data["metadata"]
    regions = []
    for r in data["regions"]:
        if r["provider"] not in PROVIDERS or r["status"] != "ga":
            continue
        loc = r["location"]
        regions.append(
            {
                "provider": r["provider"],
                "name": r["regionCode"],
                "label": make_label(r),
                "lat": loc["latitude"],
                "lng": loc["longitude"],
            }
        )

    regions.sort(key=lambda r: (r["provider"], r["name"]))

    for r in regions:  # validate before writing
        assert all(r.get(k) not in (None, "") for k in ("provider", "name", "label", "lat", "lng")), r
        assert -90 <= r["lat"] <= 90 and -180 <= r["lng"] <= 180, r

    out = {
        "attribution": (
            "Region data from jasonwilbur/mcp-server-cloud-regions "
            "(https://github.com/jasonwilbur/mcp-server-cloud-regions), MIT License; "
            f"dataset v{meta['version']}, updated {meta['lastUpdated']}, compiled from "
            "AWS/Azure/GCP published region documentation. GA regions only."
        ),
        "regions": regions,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    counts = {p: sum(1 for r in regions if r["provider"] == p) for p in PROVIDERS}
    print(f"Wrote {OUT_PATH} ({len(regions)} regions: {counts})")


if __name__ == "__main__":
    sys.exit(main())
