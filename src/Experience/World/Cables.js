import * as THREE from "three";
import Experience, { GLOBE_RADIUS } from "../Experience.js";
import { latLngToVec3 } from "./geo.js";
import { CABLE_COLOR } from "./palettes.js";

// Submarine cable overlay: every route merged into one LineSegments draw
// call, plus one instanced mesh of landing-point dots. Paths in cables.json
// are real routed geometry, already split at the antimeridian — segments
// only need subdividing so long spans hug the sphere instead of chording
// through it. Recessive info layer: low opacity, no additive blending.
// (computed lazily — GLOBE_RADIUS is TDZ-dead at module scope in the
// Experience→World→Globe→Cables import cycle)
const SURFACE_FACTOR = 1.0015;
const MAX_SEGMENT_RAD = (2 * Math.PI) / 180; // subdivide spans wider than ~2°
const LANDING_RADIUS = 0.0011; // metres

// Spherical interpolation between two unit vectors (Vector3 has no slerp).
function slerpUnit(a, b, t, out) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-6) return out.copy(a);
  const s = Math.sin(theta);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - t) * theta) / s)
    .addScaledVector(b, Math.sin(t * theta) / s);
}

export default class Cables {
  constructor(parent) {
    this.experience = new Experience();
    const data = this.experience.resources.items.cables;

    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);

    this.setRoutes(data.cables);
    this.setLandings(data.landings);
  }

  setRoutes(cables) {
    const positions = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();

    for (const cable of cables) {
      for (const path of cable.paths) {
        for (let i = 0; i < path.length - 1; i++) {
          latLngToVec3(path[i][0], path[i][1], 1, a).normalize();
          latLngToVec3(path[i + 1][0], path[i + 1][1], 1, b).normalize();
          const steps = Math.max(1, Math.ceil(a.angleTo(b) / MAX_SEGMENT_RAD));
          const surface = GLOBE_RADIUS * SURFACE_FACTOR;
          for (let s = 0; s < steps; s++) {
            slerpUnit(a, b, s / steps, p).multiplyScalar(surface);
            slerpUnit(a, b, (s + 1) / steps, q).multiplyScalar(surface);
            positions.push(p.x, p.y, p.z, q.x, q.y, q.z);
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: CABLE_COLOR,
        transparent: true,
        opacity: 0.5,
        depthWrite: false, // depthTest stays on: the ocean sphere occludes the far side
      })
    );
    this.group.add(this.lines);
  }

  setLandings(landings) {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    this.landings = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: "#93a8c2",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
      landings.length
    );
    this.landings.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.landings.frustumCulled = false;

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(LANDING_RADIUS, LANDING_RADIUS, LANDING_RADIUS);
    landings.forEach((site, i) => {
      latLngToVec3(site.lat, site.lng, GLOBE_RADIUS * SURFACE_FACTOR, pos);
      m.compose(pos, quat, scale);
      this.landings.setMatrixAt(i, m);
    });
    this.landings.instanceMatrix.needsUpdate = true;
    this.group.add(this.landings);
  }
}
