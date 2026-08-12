#!/usr/bin/env python3
"""Geocode ATLAS datacenters.csv -> data/sites.json

Passes, per row (all offline, GeoNames):
  1. city+country against cities500 gazetteer (incl. latin aliases)
  2. postal code extracted from address (GeoNames postal dump)
  3. city recovered from trailing tokens of address (n-grams, longest first)
  4. Japanese-style suffix strip (-shi/-ku/-cho/-machi) retry
  5. capital fallback for tiny territories (< 15,000 km^2: HK, SG, MO, ...)

Output data/sites.json:
  {total_records, geocoded, sites: [{lat, lng, n, city, country}]} (n desc)
"""
import csv, json, re, unicodedata
from collections import defaultdict

SCRATCH = "/private/tmp/claude-501/-Users-vertex-code-datacenter-globe/d8a61834-bebc-4ac2-9988-68943c99bb69/scratchpad"
ROOT = "/Users/vertex/code/datacenter-globe"

def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"[\.\'’‘\-,،]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()

# ---------- countries ----------
iso, capital, area = {}, {}, {}
for line in open(f"{SCRATCH}/countryInfo.txt", encoding="utf-8"):
    if line.startswith("#"): continue
    p = line.rstrip("\n").split("\t")
    if len(p) < 7: continue
    code, name, ar, cap = p[0], p[4], p[6], p[5]
    iso[norm(name)] = code
    capital[code] = cap
    try: area[code] = float(ar)
    except: area[code] = 1e9
ALIASES = {
    "usa":"US","united states":"US","united states of america":"US","us":"US",
    "uk":"GB","united kingdom":"GB","england":"GB","scotland":"GB","wales":"GB",
    "great britain":"GB","northern ireland":"GB","russia":"RU","russian federation":"RU",
    "south korea":"KR","korea":"KR","korea republic of":"KR","vietnam":"VN","viet nam":"VN",
    "taiwan":"TW","hong kong":"HK","macau":"MO","macao":"MO","czech republic":"CZ","czechia":"CZ",
    "ivory coast":"CI","cote d ivoire":"CI","the netherlands":"NL","netherlands":"NL",
    "nederland":"NL","holland":"NL","uae":"AE","united arab emirates":"AE","emirates":"AE",
    "deutschland":"DE","germany":"DE","brasil":"BR","brazil":"BR","espana":"ES","spain":"ES",
    "suisse":"CH","schweiz":"CH","svizzera":"CH","switzerland":"CH","italia":"IT","italy":"IT",
    "mexico":"MX","sverige":"SE","sweden":"SE","norge":"NO","norway":"NO","danmark":"DK",
    "denmark":"DK","suomi":"FI","finland":"FI","polska":"PL","poland":"PL","osterreich":"AT",
    "austria":"AT","belgie":"BE","belgique":"BE","belgium":"BE","turkiye":"TR","turkey":"TR",
    "moldavia":"MD","moldova":"MD","romania":"RO","hrvatska":"HR","croatia":"HR",
    "ellada":"GR","greece":"GR","portugal":"PT","ireland":"IE","eire":"IE","iceland":"IS",
    "island":"IS","magyarorszag":"HU","hungary":"HU","slovensko":"SK","slovak republic":"SK",
    "slovenija":"SI","slovenia":"SI","lietuva":"LT","lithuania":"LT","latvija":"LV","latvia":"LV",
    "eesti":"EE","estonia":"EE","bulgaria":"BG","srbija":"RS","serbia":"RS","ukraine":"UA",
    "ukraina":"UA","belarus":"BY","kazakhstan":"KZ","uzbekistan":"UZ","georgia country":"GE",
    "iran":"IR","syria":"SY","laos":"LA","brunei":"BN","bolivia":"BO","venezuela":"VE",
    "tanzania":"TZ","drc":"CD","democratic republic of the congo":"CD","republic of the congo":"CG",
    "congo":"CG","cape verde":"CV","swaziland":"SZ","eswatini":"SZ","burma":"MM","myanmar":"MM",
    "east timor":"TL","timor leste":"TL","vatican":"VA","vatican city":"VA","kosovo":"XK",
    "curacao":"CW","curacao netherlands antilles":"CW","netherlands antilles":"CW",
    "st kitts and nevis":"KN","saint kitts and nevis":"KN","st lucia":"LC","saint lucia":"LC",
    "st vincent":"VC","trinidad":"TT","trinidad and tobago":"TT","bahamas":"BS","the bahamas":"BS",
    "gambia":"GM","the gambia":"GM","puerto rico":"PR","reunion":"RE","new caledonia":"NC",
    "french polynesia":"PF","isle of man":"IM","jersey":"JE","guernsey":"GG","faroe islands":"FO",
    "greenland":"GL","aland islands":"AX","cayman islands":"KY","virgin islands":"VG",
    "british virgin islands":"VG","us virgin islands":"VI","bermuda":"BM","gibraltar":"GI",
    "philippines":"PH","pilipinas":"PH","nippon":"JP","japan":"JP","china":"CN","prc":"CN",
    "peoples republic of china":"CN","south africa":"ZA","saudi arabia":"SA","ksa":"SA","palestine":"PS","palestinian territory":"PS","israel":"IL","argentina":"AR",
    "colombia":"CO","chile":"CL","peru":"PE","ecuador":"EC","uruguay":"UY","paraguay":"PY",
    "canada":"CA","australia":"AU","new zealand":"NZ","aotearoa":"NZ","india":"IN","bharat":"IN",
    "pakistan":"PK","bangladesh":"BD","sri lanka":"LK","nepal":"NP","singapore":"SG",
    "malaysia":"MY","indonesia":"ID","thailand":"TH","cambodia":"KH","mongolia":"MN",
    "egypt":"EG","misr":"EG","morocco":"MA","maroc":"MA","algeria":"DZ","tunisia":"TN",
    "libya":"LY","nigeria":"NG","ghana":"GH","kenya":"KE","uganda":"UG","ethiopia":"ET",
    "senegal":"SN","angola":"AO","mozambique":"MZ","zimbabwe":"ZW","zambia":"ZM",
    "botswana":"BW","namibia":"NA","rwanda":"RW","cameroon":"CM","gabon":"GA",
    "mauritius":"MU","madagascar":"MG","seychelles":"SC","malta":"MT","cyprus":"CY",
    "luxembourg":"LU","luxemburg":"LU","monaco":"MC","liechtenstein":"LI","andorra":"AD",
    "san marino":"SM","qatar":"QA","kuwait":"KW","bahrain":"BH","oman":"OM","yemen":"YE",
    "jordan":"JO","lebanon":"LB","iraq":"IQ","afghanistan":"AF","armenia":"AM",
    "azerbaijan":"AZ","kyrgyzstan":"KG","tajikistan":"TJ","turkmenistan":"TM",
}
for k, v in ALIASES.items():
    iso.setdefault(k, v)

MAX_COUNTRY_WORDS = 4
def country_from_tokens(toks):
    """Try trailing n-grams of normalized tokens against country table."""
    for take in range(min(MAX_COUNTRY_WORDS, len(toks)), 0, -1):
        tail = " ".join(toks[-take:])
        if tail in iso:
            return iso[tail], take
    return None, 0

# ---------- gazetteer ----------
gaz = {}
for line in open(f"{SCRATCH}/cities500.txt", encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    name, asciiname, alts = p[1], p[2], p[3]
    lat, lng, cc, pop = float(p[4]), float(p[5]), p[8], int(p[14] or 0)
    keys = {norm(name), norm(asciiname)}
    for a in alts.split(","):
        if a and all(ord(c) < 0x250 for c in a):
            keys.add(norm(a))
    disp = asciiname or name
    for k in keys:
        if not k: continue
        cur = gaz.get((cc, k))
        if cur is None or pop > cur[2]:
            gaz[(cc, k)] = (lat, lng, pop, disp)

# ---------- postal index ----------
postal = {}
for line in open(f"{SCRATCH}/postal.txt", encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    if len(p) < 11: continue
    cc, code, place, lat, lng = p[0], p[1].strip().upper(), p[2], p[9], p[10]
    if not lat or not lng: continue
    try: lat, lng = float(lat), float(lng)
    except: continue
    postal[(cc, code)] = (lat, lng, place)
    nos = code.replace(" ", "")
    postal.setdefault((cc, nos), (lat, lng, place))
    head = code.split(" ")[0].split("-")[0]
    postal.setdefault((cc, head), (lat, lng, place))

US_STATES = {
 'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO',
 'connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID',
 'illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA',
 'maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
 'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
 'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
 'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',
 'tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA',
 'west virginia':'WV','wisconsin':'WI','wyoming':'WY','district of columbia':'DC','washington dc':'DC'}

JP_SUFFIX = re.compile(r"[\s\-](shi|ku|cho|machi|gun|city)$")
PHONE_TAIL = re.compile(r"(\+?\(?[\d][\d\s\(\)\/\-\.]{6,}[\d])\s*$")
URL_TOKEN = re.compile(r"(www\.|https?://|\.com|\.net|\.org)", re.I)

def clean_address(a):
    a = a.strip()
    # peel trailing phone numbers / urls (can repeat)
    for _ in range(3):
        a2 = PHONE_TAIL.sub("", a).strip(" -–—·,")
        toks = a2.split()
        while toks and (URL_TOKEN.search(toks[-1]) or "@" in toks[-1]):
            toks.pop()
        a2 = " ".join(toks)
        if a2 == a: break
        a = a2
    return a

CITY_ALIAS = {"caba": "buenos aires", "nyc": "new york", "new york city": "new york",
              "sp": "sao paulo", "bengaluru": "bangalore"}

def _gaz_get(cc, key):
    hit = gaz.get((cc, key))
    return (hit[0], hit[1], hit[3]) if hit else None

def lookup_city(cc, city):
    if not cc or not city: return None
    n = norm(city)
    n = CITY_ALIAS.get(n, n)
    hit = _gaz_get(cc, n)
    if hit: return hit
    m = JP_SUFFIX.sub("", n)
    if m != n:
        hit = _gaz_get(cc, m)
        if hit: return hit
    # multi-word city: try individual tokens (longest & most populated wins)
    toks = [t for t in n.split() if len(t) >= 4]
    best = None
    for t in toks:
        h = gaz.get((cc, t))
        if h and (best is None or h[2] > best[2]):
            best = h
    return (best[0], best[1], best[3]) if best else None

ZIPPY = re.compile(r"^[A-Za-z]{0,4}[\d][A-Za-z\d\s\-]{0,9}$")
def lookup_postal(cc, address):
    if not cc or not address: return None
    raw = address.upper()
    toks = re.split(r"[\s,]+", raw)
    # scan from the end; try 2-token combos (UK/CA/NL formats) then singles
    cands = []
    for i in range(len(toks) - 1, -1, -1):
        t = toks[i].strip(".,;:")
        if not t: continue
        if i + 1 < len(toks):
            pair = t + " " + toks[i + 1].strip(".,;:")
            cands.append(pair); cands.append(pair.replace(" ", ""))
        cands.append(t)
        cands.append(t.split("-")[0])
    for c in cands:
        if not c or len(c) < 3 or len(c) > 10: continue
        if not any(ch.isdigit() for ch in c): continue
        if not ZIPPY.match(c): continue
        hit = postal.get((cc, c))
        if hit: return hit
    return None

def lookup_address_city(cc, address, country_raw):
    if not address: return None
    toks = norm(address).split()
    _, take = country_from_tokens(toks)
    if take: toks = toks[:-take]
    ncr = norm(country_raw)
    if ncr and toks and " ".join(toks[-len(ncr.split()):]) == ncr:
        toks = toks[:-len(ncr.split())]
    while toks and re.fullmatch(r"[\d\-]{3,12}|[a-z]{1,2}\d[a-z\d]*|\d+[a-z]{1,2}", toks[-1]):
        toks.pop()
    for n in (4, 3, 2, 1):
        if len(toks) >= n:
            cand = " ".join(toks[-n:])
            cand = CITY_ALIAS.get(cand, cand)
            hit = _gaz_get(cc, cand)
            if hit: return hit
            m = JP_SUFFIX.sub("", cand)
            if m != cand:
                hit = _gaz_get(cc, m)
                if hit: return hit
    if cc == "US" and toks:
        t = list(toks)
        for take in (2, 1):
            if len(t) >= take and " ".join(t[-take:]) in US_STATES:
                t = t[:-take]
                for n in (4, 3, 2, 1):
                    if len(t) >= n:
                        hit = _gaz_get(cc, " ".join(t[-n:]))
                        if hit: return hit
                break
    return None

def capital_fallback(cc):
    if cc and area.get(cc, 1e9) < 18500:
        cap = capital.get(cc)
        if cap:
            return _gaz_get(cc, norm(cap))
    return None

rows = list(csv.DictReader(open(f"{ROOT}/data/datacenters.csv", encoding="utf-8")))
matched = 0
via = defaultdict(int)
agg = {}
unmatched = []
for r in rows:
    addr = clean_address(r["address"] or "")
    cc = None
    if r["country"].strip():
        cc = iso.get(norm(r["country"]))
    if not cc and addr:
        cc, _ = country_from_tokens(norm(addr).split())
    pt = None; how = None
    if cc:
        pt = lookup_city(cc, r["city"]);              how = "city" if pt else None
        if not pt:
            pt = lookup_postal(cc, addr);             how = "postal" if pt else None
        if not pt:
            pt = lookup_address_city(cc, addr, r["country"]); how = "addr" if pt else None
        if not pt and r["city"]:
            m = re.search(re.escape(r["city"].strip()) + r"[\s\-]+([A-Za-zÀ-ÿ\.\-']+)(?:[\s\-]+([A-Za-zÀ-ÿ\.\-']+))?", addr)
            if m:
                for cand in filter(None, [f"{r['city']} {m.group(1)} {m.group(2) or ''}".strip(), f"{r['city']} {m.group(1)}"]):
                    pt = lookup_city(cc, cand)
                    if pt: how = "city+addr"; break
        if not pt:
            pt = capital_fallback(cc);                how = "capital" if pt else None
    if pt:
        matched += 1; via[how] += 1
        label = pt[2] if len(pt) > 2 and pt[2] else (r["city"] if len(r["city"] or "") > 3 else "")
        key = (round(pt[0], 3), round(pt[1], 3))
        a = agg.setdefault(key, {"lat": key[0], "lng": key[1], "n": 0, "city": "", "country": r["country"] or ""})
        a["n"] += 1
        if label and (not a["city"] or len(label) > 3 and a["city"] in ("", None)):
            a["city"] = label
    else:
        unmatched.append(f"{r['city']!r} | {r['country']!r} | {(r['address'] or '')[:70]!r}")

sites = sorted(agg.values(), key=lambda a: -a["n"])
json.dump({"total_records": len(rows), "geocoded": matched, "sites": sites},
          open(f"{ROOT}/data/sites.json", "w"), ensure_ascii=False, separators=(",", ":"))
rep = [f"rows={len(rows)} matched={matched} ({matched/len(rows)*100:.1f}%) sites={len(sites)}",
       f"via={dict(via)}", "", f"UNMATCHED ({len(unmatched)}):"] + unmatched[:80]
open(f"{ROOT}/data/geocode_report.txt", "w").write("\n".join(rep))
print("\n".join(rep[:2]))
