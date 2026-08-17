import * as THREE from "three";
import Experience, { GLOBE_RADIUS } from "../Experience.js";

// Density heatmap view: gaussian splats per site (weight ∝ √count, like the
// columns' height) accumulated into an equirect buffer once at build, then
// mapped through the same single-hue amber ramp the columns use — transparent
// where empty so land/graticule read through. Metric "percapita" reweights
// the splats to √(count / country pop); each metric's texture is baked once
// (lazily for percapita) and cached, normalized to its own max.
const W = 2048;
const H = 1024;
const SIGMA_PX = 9; // ~250 km at the equator
const GAMMA = 0.35; // lifts sparse single-facility sites into visibility

// ramp stops: t, rgb, alpha (amber, monotone lightness on the dark globe)
const STOPS = [
  { t: 0.0, c: [94, 64, 31], a: 0.0 },
  { t: 0.25, c: [94, 64, 31], a: 0.5 },
  { t: 0.6, c: [201, 143, 74], a: 0.8 },
  { t: 1.0, c: [255, 233, 196], a: 0.95 },
];

function ramp(t) {
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].t && t <= STOPS[i + 1].t) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const f = hi.t === lo.t ? 0 : (t - lo.t) / (hi.t - lo.t);
  return [
    lo.c[0] + (hi.c[0] - lo.c[0]) * f,
    lo.c[1] + (hi.c[1] - lo.c[1]) * f,
    lo.c[2] + (hi.c[2] - lo.c[2]) * f,
    (lo.a + (hi.a - lo.a) * f) * 255,
  ];
}

export default class Heatmap {
  constructor(parent) {
    this.experience = new Experience();
    this.sites = this.experience.resources.items.sites.sites;
    this.countries = this.experience.resources.items.countryStats.countries;

    this.metric = "absolute"; // absolute | percapita
    this.textures = { absolute: this.bake("absolute") };

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.003, 96, 96),
      new THREE.MeshBasicMaterial({
        map: this.textures.absolute,
        transparent: true,
        depthWrite: false,
      })
    );
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  setMetric(metric) {
    if (metric === this.metric) return;
    this.metric = metric;
    if (!this.textures[metric]) this.textures[metric] = this.bake(metric);
    this.mesh.material.map = this.textures[metric];
  }

  bake(metric) {
    return this.colorize(this.splat(this.sites, metric));
  }

  splat(sites, metric) {
    const buf = new Float32Array(W * H);
    for (const s of sites) {
      let w;
      if (metric === "percapita") {
        const pop = this.countries[s.country]?.pop_m;
        if (!pop) continue; // no population — the site can't contribute
        w = Math.sqrt(s.n / pop);
      } else {
        w = Math.sqrt(s.n);
      }
      const cx = ((s.lng + 180) / 360) * W;
      const cy = ((90 - s.lat) / 180) * H;
      const sy = SIGMA_PX;
      // longitude pixels shrink toward the poles
      const sx = SIGMA_PX / Math.max(Math.cos((s.lat * Math.PI) / 180), 0.2);
      const ry = Math.ceil(3 * sy);
      const rx = Math.ceil(3 * sx);
      for (let dy = -ry; dy <= ry; dy++) {
        const y = Math.round(cy) + dy;
        if (y < 0 || y >= H) continue;
        const gy = dy / sy;
        for (let dx = -rx; dx <= rx; dx++) {
          const x = (((Math.round(cx) + dx) % W) + W) % W; // wrap the seam
          const gx = dx / sx;
          buf[y * W + x] += w * Math.exp(-0.5 * (gx * gx + gy * gy));
        }
      }
    }
    return buf;
  }

  colorize(intensity) {
    let max = 0;
    for (let i = 0; i < intensity.length; i++) {
      if (intensity[i] > max) max = intensity[i];
    }
    const img = new ImageData(W, H);
    for (let i = 0; i < intensity.length; i++) {
      if (intensity[i] === 0) continue;
      const t = Math.pow(intensity[i] / max, GAMMA);
      const [r, g, b, a] = ramp(t);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = a;
    }
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.getContext("2d").putImageData(img, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
}
