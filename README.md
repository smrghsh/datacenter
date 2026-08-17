# data center — the whole earth hums

18,110 data centers (13,376 geocoded) from the
[ATLAS dataset](https://github.com/Ringmast4r/Global-Data-Center-Map) on a
hand-held globe. Vanilla three.js, WebXR, tuned for Apple Vision Pro.

**[Live: smrghsh.github.io/datacenter](https://smrghsh.github.io/datacenter/)**

![The globe: amber columns for facility density on dot-matrix continents,
hovering Ashburn — 145 facilities](static/screenshot.jpg)

Matte, scientific info-layer: dot-matrix continents (Natural Earth 50m),
15° graticule, one amber ramp for facility density (height ∝ √count).
Environment: seeded starfield, Milky Way band, galaxy sprites.

## run

```bash
npm install
npm run dev          # https://<your-mac>:5173  (self-signed; accept on device)
NO_SSL=1 npm run dev # plain http for local look-dev
```

Open on desktop for the orbit/drag view, or tap **ENTER VR** (three's
standard VRButton) in Safari on Vision Pro (same Wi-Fi, accept the
certificate warning once). Append `#debug` for the lil-gui panel.

## interactions

- **Vision Pro** — pinch with the **right hand anywhere** and translate:
  the globe rotates by the exact corresponding surface arc, any direction
  (shred's grab-and-pull locomotion, re-aimed at an object). Release with
  motion to throw; it keeps spinning with damped momentum. Works both with
  hand-tracking joints and the system-pinch transient-pointer. Hands render
  as three's standard skinned mesh (WebXR generic-hand profile, vendored
  locally). Touch a column with the **left index fingertip**
  to inspect it — city, country, facility count on a floating label.
- **Desktop** — left-drag: arcball (grabbed point stays under cursor);
  right-drag: orbit; wheel: dolly. Hover a column for the same site info.

## views

Two data layers, one visible at a time: **columns** (height ∝ √count) and
**heatmap** (gaussian splats through the same amber ramp, √count-weighted,
baked once into a 2048×1024 equirect texture). Toggle top-left on desktop;
in XR, turn your **left palm toward your face** — a menu floats above the
palm; tap a row with the right index fingertip.

The globe is a 24-inch (0.61 m) instrument placed 0.7 m in front of your
head at session start.

## architecture

Brahma-style `Experience.js` singleton (Bruno Simon lineage via
caye-caulker/shred): `Experience` owns `Sizes/Time/Debug/Resources`,
`Camera`, `Renderer` (WebGL — no WebGPU needed here, which keeps visionOS
Safari on the well-trodden WebXR path), `World` (Globe, DataPoints,
Graticule, Stars), and `XR` (XRManager, Hands, GlobeGrab). The loop runs on
`renderer.setAnimationLoop` so it survives entering XR; the camera rig is a
`cameraGroup` the hands/controllers parent to.

## data pipeline (`scripts/`)

- `geocode.py` — offline geocoding of the ATLAS CSV against GeoNames
  (cities500 + postal codes + capitals for small territories):
  73.9% match rate → `static/data/sites.json` (3,895 aggregated sites).
  The dataset's own coordinates cover only 34% and contain sign bugs
  (Singapore at −1.35°), hence the rebuild.
- `land_dots.py` — Fibonacci-sphere sampling of Natural Earth 50m land
  polygons → `static/data/land.bin` (17,923 dots, Int16 lat/lng pairs).

Data credit: [Ringmast4r / Global-Data-Center-Map](https://github.com/Ringmast4r/Global-Data-Center-Map)
(attribution license) · GeoNames (CC-BY) · Natural Earth (public domain).
