import * as THREE from "three";
import Experience, { GLOBE_RADIUS } from "../Experience.js";
import { latLngToVec3 } from "./geo.js";

// One thin radial column per site; height ~ sqrt(count) (area-honest for a
// 1D mark), colour a single amber ramp: dim ochre (1 facility) -> warm light
// (Ashburn). Matte — no additive blending on data.
const RAMP_LOW = new THREE.Color("#5e401f");
const RAMP_HIGH = new THREE.Color("#ffcf8a");

export default class DataPoints {
  constructor(parent) {
    this.experience = new Experience();
    this.debug = this.experience.debug;
    const sites = this.experience.resources.items.sites.sites;
    this.sites = sites;

    this.params = {
      baseHeight: 0.0016, // metres, n = 1
      heightScale: 0.00115, // metres per sqrt(n)
      width: 0.0011, // column thickness, metres
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
      f.add(this.params, "baseHeight", 0.0005, 0.006, 0.0001).onChange(() => this.rebuild());
      f.add(this.params, "heightScale", 0.0002, 0.004, 0.0001).onChange(() => this.rebuild());
      f.add(this.params, "width", 0.0004, 0.003, 0.0001).onChange(() => this.rebuild());
      f.close();
    }
  }

  rebuild() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const sqrtMax = Math.sqrt(this.maxN);

    this.sites.forEach((site, i) => {
      latLngToVec3(site.lat, site.lng, GLOBE_RADIUS, pos);
      const normal = pos.clone().normalize();
      q.setFromUnitVectors(up, normal);
      const t = Math.sqrt(site.n) / sqrtMax; // 0..1
      const h = this.params.baseHeight + this.params.heightScale * Math.sqrt(site.n);
      scale.set(this.params.width, h, this.params.width);
      m.compose(pos, q, scale);
      this.mesh.setMatrixAt(i, m);
      color.copy(RAMP_LOW).lerp(RAMP_HIGH, Math.pow(t, 0.6));
      this.mesh.setColorAt(i, color);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update() {}
}
