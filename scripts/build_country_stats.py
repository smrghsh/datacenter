#!/usr/bin/env python3
"""Build static/data/country_stats.json for the datacenter globe.

Joins the exact country strings found in static/data/sites.json with:
  - Population (millions): World Bank SP.POP.TOTL, 2024
    https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?date=2024&format=json&per_page=400
  - Grid carbon intensity (gCO2eq/kWh): Ember yearly electricity data, 2024,
    as republished (CC-BY) by Our World in Data:
    https://ourworldindata.org/grapher/carbon-intensity-electricity.csv

Keys in the output "countries" object match sites.json country strings
byte-for-byte (including local-language variants like "España", "México").

Usage:  python3 scripts/build_country_stats.py
"""

import csv
import io
import json
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "static" / "data" / "sites.json"
OUT = ROOT / "static" / "data" / "country_stats.json"

CARBON_URL = (
    "https://ourworldindata.org/grapher/carbon-intensity-electricity.csv"
    "?v=1&csvType=full&useColumnShortNames=true"
)
POP_URL = (
    "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL"
    "?date=2024&format=json&per_page=400"
)
CARBON_YEAR = 2024

# Exact sites.json country string -> ISO3 code.
NAME_TO_ISO3 = {
    "United States": "USA", "United Kingdom": "GBR", "Germany": "DEU",
    "France": "FRA", "Netherlands": "NLD", "China": "CHN", "Canada": "CAN",
    "Australia": "AUS", "Brazil": "BRA", "Italy": "ITA", "Japan": "JPN",
    "India": "IND", "Spain": "ESP", "Switzerland": "CHE", "Indonesia": "IDN",
    "Singapore": "SGP", "Malaysia": "MYS", "Sweden": "SWE", "Russia": "RUS",
    "Hong Kong": "HKG", "Poland": "POL", "South Africa": "ZAF",
    "Belgium": "BEL", "Austria": "AUT", "New Zealand": "NZL",
    "Ireland": "IRL", "Mexico": "MEX", "Finland": "FIN", "Denmark": "DNK",
    "Portugal": "PRT", "Norway": "NOR", "Bulgaria": "BGR", "Romania": "ROU",
    "South Korea": "KOR", "Israel": "ISR", "Turkey": "TUR", "Thailand": "THA",
    "United Arab Emirates": "ARE", "Vietnam": "VNM", "Argentina": "ARG",
    "Ukraine": "UKR", "Chile": "CHL", "Nigeria": "NGA", "Colombia": "COL",
    "Czech Republic": "CZE", "Cyprus": "CYP", "Ghana": "GHA", "Kenya": "KEN",
    "Taiwan": "TWN", "Luxembourg": "LUX", "España": "ESP", "México": "MEX",
    "Pakistan": "PAK", "Estonia": "EST", "Latvia": "LVA", "Hungary": "HUN",
    "Slovakia": "SVK", "Uganda": "UGA", "Saudi Arabia": "SAU",
    "Lithuania": "LTU", "Tanzania": "TZA", "Mauritius": "MUS",
    "Canadá": "CAN", "Peru": "PER", "Côte d'Ivoire": "CIV", "Egypt": "EGY",
    "Malta": "MLT", "Philippines": "PHL", "Mozambique": "MOZ", "Qatar": "QAT",
    "Slovenia": "SVN", "Costa Rica": "CRI", "Angola": "AGO", "Panama": "PAN",
    "Zambia": "ZMB", "Tunisia": "TUN", "Croatia": "HRV", "Jordan": "JOR",
    "Namibia": "NAM", "Kuwait": "KWT", "Bahrain": "BHR", "Uruguay": "URY",
    "Iran": "IRN", "Greece": "GRC", "Morocco": "MAR",
    "Republic of Korea": "KOR", "Armenia": "ARM", "Serbia": "SRB",
    "Ecuador": "ECU", "Cambodia": "KHM", "Algeria": "DZA", "Lebanon": "LBN",
    "Belarus": "BLR", "Montenegro": "MNE", "Venezuela": "VEN",
    "Senegal": "SEN", "Cameroon": "CMR", "Oman": "OMN", "Kazakhstan": "KAZ",
    "Iceland": "ISL", "België": "BEL", "Türkiye": "TUR",
    "Afghanistan": "AFG", "Azerbaijan": "AZE", "Guatemala": "GTM",
    "Chad": "TCD", "Burkina Faso": "BFA", "Zimbabwe": "ZWE",
    "North Macedonia": "MKD", "Nepal": "NPL", "Georgia": "GEO",
    "Libya": "LBY", "Guernsey": "GGY", "The Gambia": "GMB",
    "São Tomé and Príncipe": "STP", "Svizzera": "CHE",
    "Liechtenstein": "LIE", "Norge": "NOR", "România": "ROU",
}

# ISO3 with no data of its own -> ISO3 whose values stand in for it.
# (territories / microstates absent from World Bank and/or Ember)
CARBON_PROXY = {"GGY": "GBR", "LIE": "CHE"}
# Population fallbacks (millions) for ISO3 absent from World Bank, from
# UN World Population Prospects 2024 estimates.
POP_FALLBACK_M = {"TWN": 23.4, "GGY": 0.064}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "datacenter-globe-build/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main() -> None:
    sites = json.loads(SITES.read_text())["sites"]
    weight = Counter()
    for s in sites:
        weight[s.get("country", "")] += s.get("n", 1)
    total_n = sum(weight.values())

    # --- carbon intensity (Ember via OWID), CARBON_YEAR with prior-year fallback
    carbon_rows = list(csv.DictReader(io.StringIO(fetch(CARBON_URL).decode("utf-8"))))
    carbon = {}       # iso3 -> gCO2/kWh
    carbon_prior = {}
    for r in carbon_rows:
        code, year = r["code"], int(r["year"])
        if not code:
            continue
        val = float(r["co2_intensity__gco2_kwh"])
        if year == CARBON_YEAR:
            carbon[code] = val
        elif year == CARBON_YEAR - 1:
            carbon_prior[code] = val
    world_gco2 = carbon["OWID_WRL"]

    # --- population (World Bank, 2024)
    pop_recs = json.loads(fetch(POP_URL))[1]
    pop_m = {
        r["countryiso3code"]: r["value"] / 1e6
        for r in pop_recs
        if r["value"] is not None and r["countryiso3code"]
    }

    countries = {}
    approximated = []
    unmatched = []
    for name in sorted(weight, key=lambda k: -weight[k]):
        approx_reason = None
        if name in NAME_TO_ISO3:
            iso = NAME_TO_ISO3[name]
        elif name in ("", "Unknown"):
            # Ungeocodable rows: give downstream code a world-average fallback.
            countries[name] = {"pop_m": None, "gco2_kwh": round(world_gco2, 1)}
            approximated.append(name if name else "(empty string)")
            continue
        else:
            unmatched.append(name)
            continue

        p = pop_m.get(iso)
        if p is None:
            p = POP_FALLBACK_M.get(iso)
            approx_reason = "population from UN WPP fallback"
        g = carbon.get(iso)
        if g is None:
            g = carbon_prior.get(iso)
            if g is not None:
                approx_reason = f"carbon from {CARBON_YEAR - 1}"
        if g is None and iso in CARBON_PROXY:
            proxy = CARBON_PROXY[iso]
            g = carbon.get(proxy, carbon_prior.get(proxy))
            approx_reason = f"carbon from proxy {proxy}"
        if g is None:
            g = world_gco2
            approx_reason = "carbon from world average"
        if p is None:
            unmatched.append(name)
            continue
        countries[name] = {"pop_m": round(p, 3), "gco2_kwh": round(g, 1)}
        if approx_reason:
            approximated.append(name)

    covered_n = sum(weight[k] for k in countries)
    named_n = sum(v for k, v in weight.items() if k not in ("", "Unknown"))
    named_covered = sum(weight[k] for k in countries if k not in ("", "Unknown"))

    out = {
        "meta": {
            "pop_source": "World Bank SP.POP.TOTL 2024 (api.worldbank.org)",
            "carbon_source": (
                "Ember Yearly Electricity Data 2024, via Our World in Data "
                "grapher 'carbon-intensity-electricity' (CC-BY)"
            ),
            "carbon_year": CARBON_YEAR,
            "world_gco2_kwh": round(world_gco2, 1),
            "approximated": sorted(approximated),
        },
        "countries": countries,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")

    print(f"wrote {OUT}")
    print(f"countries: {len(countries)}")
    print(f"coverage (all rows):   {covered_n}/{total_n} = {covered_n / total_n:.4f}")
    print(f"coverage (named rows): {named_covered}/{named_n} = {named_covered / named_n:.4f}")
    if unmatched:
        print("UNMATCHED:", unmatched)
    for probe in ["United States", "France", "Poland", "India"]:
        print(probe, countries.get(probe))


if __name__ == "__main__":
    main()
