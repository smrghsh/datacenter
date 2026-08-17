import * as THREE from "three";
import Experience, { GLOBE_RADIUS } from "../Experience.js";
import { latLngToVec3 } from "./geo.js";
import { OPERATOR_CLASSES, CARBON_RAMP } from "./palettes.js";

// One thin radial column per site; height ~ sqrt(count) (area-honest for a
// 1D mark), colour a single amber ramp: dim ochre (1 facility) -> warm light
// (Ashburn). Matte — no additive blending on data.
// Metric "percapita" swaps the height weight to sqrt(n / country pop);
// colour modes "operator" / "carbon" swap the ramp for categorical /
// diverging palettes from palettes.js.
const RAMP_LOW = new THREE.Color("#5e401f");
const RAMP_HIGH = new THREE.Color("#ffcf8a");
const OPERATOR_COLORS = OPERATOR_CLASSES.map((c) => new THREE.Color(c.color));
const CARBON_CLEAN = new THREE.Color(CARBON_RAMP.clean);
const CARBON_MID = new THREE.Color(CARBON_RAMP.mid);
const CARBON_DIRTY = new THREE.Color(CARBON_RAMP.dirty);

export default class DataPoints {
  constructor(parent) {
    this.experience = new Experience();
    this.debug = this.experience.debug;
    const sites = this.experience.resources.items.sites.sites;
    this.sites = sites;
    const stats = this.experience.resources.items.countryStats;
    this.countries = stats.countries;
    this.worldGco2 = stats.meta.world_gco2_kwh;

    this.metric = "absolute"; // absolute | percapita
    this.colorMode = "density"; // density | operator | carbon
    this.version = 0;

    this.params = {
      baseHeight: 0.0032, // metres, n = 1
      heightScale: 0.0023, // metres per sqrt(n)
      width: 0.0022, // column thickness, metres
    };

    const maxN = sites.reduce((m, s) => Math.max(m, s.n), 1);
    this.maxN = maxN;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // grow from the surface outward
    this.material = new THREE.MeshBasicMaterial({ toneMapped: true });
    this.mesh = new THREE.InstancedMesh(geo, this.material, sites.length);
    this.mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.rebuild();
    parent.add(this.mesh);

    if (this.debug.active) {
      const f = this.debug.ui.addFolder("data");
      f.add(this.params, "baseHeight", 0.001, 0.012, 0.0002).onChange(() => this.rebuild());
      f.add(this.params, "heightScale", 0.0004, 0.008, 0.0002).onChange(() => this.rebuild());
      f.add(this.params, "width", 0.0008, 0.006, 0.0002).onChange(() => this.rebuild());
      f.close();
    }
  }

  setMetric(metric) {
    if (metric === this.metric) return;
    this.metric = metric;
    this.rebuild();
  }

  setColorMode(mode) {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    this.rebuild();
  }

  // √-weight of site i under the current metric, in sqrt(n) units after the
  // normalizer. Per-capita sites in a country with no population get 0.
  _weight(i) {
    const site = this.sites[i];
    if (this.metric === "percapita") {
      const pop = this.countries[site.country]?.pop_m;
      return pop ? Math.sqrt(site.n / pop) : 0;
    }
    return Math.sqrt(site.n);
  }

  // Per-metric normalizer: rescales per-capita √-weights so the tallest
  // per-capita column matches the tallest absolute one. Computed once, cached.
  _normalizer() {
    if (this.metric !== "percapita") return 1;
    if (this._percapScale === undefined) {
      let max = 0;
      for (let i = 0; i < this.sites.length; i++) max = Math.max(max, this._weight(i));
      this._percapScale = max > 0 ? Math.sqrt(this.maxN) / max : 0;
    }
    return this._percapScale;
  }

  rebuild() {
    this.version = (this.version || 0) + 1;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    this.sites.forEach((site, i) => {
      latLngToVec3(site.lat, site.lng, GLOBE_RADIUS, pos);
      const normal = pos.clone().normalize();
      q.setFromUnitVectors(up, normal);
      const h = this.heightFor(i);
      if (h > 0) scale.set(this.params.width, h, this.params.width);
      else scale.set(0, 0, 0); // no data under this metric — hide the column
      m.compose(pos, q, scale);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, this.colorFor(i, color));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // Colour of site i under the CURRENT mode (the inspector restores
  // highlights through this).
  colorFor(i, out = new THREE.Color()) {
    const site = this.sites[i];
    if (this.colorMode === "operator") {
      // dominant class = argmax of ops (tie -> first in h,c,t,o order)
      let best = 0;
      for (let k = 1; k < site.ops.length; k++) {
        if (site.ops[k] > site.ops[best]) best = k;
      }
      return out.copy(OPERATOR_COLORS[best]);
    }
    if (this.colorMode === "carbon") {
      // diverging: clean at 0, mid at world average, dirty at >= 2x world
      const g = this.countries[site.country]?.gco2_kwh;
      if (g == null) return out.copy(CARBON_MID);
      if (g <= this.worldGco2) return out.copy(CARBON_CLEAN).lerp(CARBON_MID, g / this.worldGco2);
      return out.copy(CARBON_MID).lerp(CARBON_DIRTY, Math.min(g / this.worldGco2 - 1, 1));
    }
    const t = Math.sqrt(site.n) / Math.sqrt(this.maxN);
    return out.copy(RAMP_LOW).lerp(RAMP_HIGH, Math.pow(t, 0.6));
  }

  // Column height of site i in metres under the CURRENT metric.
  heightFor(i) {
    const w = this._weight(i) * this._normalizer();
    return w > 0 ? this.params.baseHeight + this.params.heightScale * w : 0;
  }

  update() {}
}
