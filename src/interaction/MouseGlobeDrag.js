import * as THREE from "three";
import Experience, { GLOBE_RADIUS } from "../Experience/Experience.js";

// Desktop parity for the XR grab: left-drag arcball. The surface point you
// grab stays under the cursor; release hands off momentum. Right-drag still
// orbits the camera (OrbitControls).
export default class MouseGlobeDrag {
  constructor() {
    this.experience = new Experience();
    this.canvas = this.experience.canvas;
    this.camera = this.experience.camera;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragging = false;
    this.prevDir = new THREE.Vector3();
    this._velocitySamples = [];
    this._lastTime = 0;

    this.canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", () => this.onUp());
    window.addEventListener("pointercancel", () => this.onUp());
  }

  _dirAt(e, mustHit) {
    const globe = this.experience.world.globe;
    if (!globe) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera.instance);
    const center = globe.group.getWorldPosition(new THREE.Vector3());
    const sphere = new THREE.Sphere(center, GLOBE_RADIUS);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectSphere(sphere, hit)) {
      return hit.sub(center).normalize();
    }
    if (mustHit) return null;
    // off-sphere during a drag: closest point on the ray to the centre
    const closest = new THREE.Vector3();
    this.raycaster.ray.closestPointToPoint(center, closest);
    return closest.sub(center).normalize();
  }

  onDown(e) {
    if (e.button !== 0 || this.experience.isXRActive()) return;
    // A second finger means pinch-zoom/orbit (OrbitControls) — let go.
    if (e.pointerType === "touch" && this.dragging) {
      this.onUp();
      return;
    }
    const dir = this._dirAt(e, true);
    if (!dir) return;
    this.dragging = true;
    this.prevDir.copy(dir);
    this._velocitySamples.length = 0;
    this._lastTime = performance.now();
    this.experience.world.globe.setSpin(new THREE.Vector3());
  }

  onMove(e) {
    if (!this.dragging) return;
    const globe = this.experience.world.globe;
    const dir = this._dirAt(e, false);
    if (!dir) return;
    const q = new THREE.Quaternion().setFromUnitVectors(this.prevDir, dir);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    if (angle > 1e-5) {
      const axis = new THREE.Vector3(q.x, q.y, q.z).normalize();
      globe.rotateWorldAxis(axis, angle);
      const now = performance.now();
      const dt = Math.max((now - this._lastTime) / 1000, 1e-3);
      this._lastTime = now;
      this._velocitySamples.push(axis.multiplyScalar(angle / dt));
      if (this._velocitySamples.length > 5) this._velocitySamples.shift();
    }
    this.prevDir.copy(dir);
  }

  onUp() {
    if (!this.dragging) return;
    this.dragging = false;
    const globe = this.experience.world.globe;
    if (globe && this._velocitySamples.length) {
      const avg = new THREE.Vector3();
      for (const s of this._velocitySamples) avg.add(s);
      avg.divideScalar(this._velocitySamples.length);
      if (avg.length() > 0.2) globe.setSpin(avg);
    }
    this._velocitySamples.length = 0;
  }
}
