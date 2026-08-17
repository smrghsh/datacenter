import * as THREE from "three";
import Experience, { GLOBE_RADIUS } from "../Experience.js";
import { latLngToVec3 } from "./geo.js";
import { CLOUD_PROVIDERS } from "./palettes.js";

// Cloud region markers: a flat ring per region, lying tangent on the sphere.
// One InstancedMesh per provider so each keeps its categorical colour from
// palettes.js — three draw calls total.
// (GLOBE_RADIUS is TDZ-dead at module scope in the import cycle — use inside
// the constructor only)
const SURFACE_FACTOR = 1.004;
const OUTER_RADIUS = 0.003; // metres
// TorusGeometry(1, 0.18) spans radius 1.18 in its XY plane.
const RING_SCALE = OUTER_RADIUS / 1.18;

export default class CloudRegions {
  constructor(parent) {
    this.experience = new Experience();
    const regions = this.experience.resources.items.cloudRegions.regions;

    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);

    const geo = new THREE.TorusGeometry(1, 0.18, 8, 24);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1); // torus hole axis
    const scale = new THREE.Vector3(RING_SCALE, RING_SCALE, RING_SCALE);

    this.meshes = {};
    for (const provider of CLOUD_PROVIDERS) {
      const sites = regions.filter((r) => r.provider === provider.key);
      if (sites.length === 0) continue;
      const mesh = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: provider.color,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
        sites.length
      );
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.frustumCulled = false;
      sites.forEach((site, i) => {
        latLngToVec3(site.lat, site.lng, GLOBE_RADIUS * SURFACE_FACTOR, pos);
        normal.copy(pos).normalize();
        quat.setFromUnitVectors(zAxis, normal); // ring lies tangent to the surface
        m.compose(pos, quat, scale);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes[provider.key] = mesh;
      this.group.add(mesh);
    }
  }
}
