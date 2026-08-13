import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import Experience, { GLOBE_HOME } from "../Experience.js";

// Session lifecycle via three's standard VRButton (hand-tracking appended to
// its optionalFeatures). On the first XR frames we re-place the globe
// relative to the actual head pose — floor origins differ per device/seating.
export default class XRManager {
  constructor() {
    this.experience = new Experience();
    this.renderer = this.experience.renderer.instance;
    this._placed = false;
    this._framesSeen = 0;

    document.body.appendChild(
      VRButton.createButton(this.renderer, {
        optionalFeatures: ["hand-tracking"],
      })
    );

    this.renderer.xr.addEventListener("sessionstart", () => {
      this._placed = false;
      this._framesSeen = 0;
      document.body.classList.add("xr-active");
    });
    this.renderer.xr.addEventListener("sessionend", () => {
      document.body.classList.remove("xr-active");
      // restore the desktop composition
      this.experience.world.globe?.group.position.copy(GLOBE_HOME);
    });
  }

  // Place the globe 0.7 m along the head's horizontal forward (nearest
  // surface ~0.4 m away), slightly below eye level. Wait a few frames for a
  // real pose (first frames can be identity on some devices).
  placeGlobe() {
    const cam = this.renderer.xr.getCamera();
    const headPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    if (headPos.lengthSq() < 1e-6) return false;

    const e = cam.matrixWorld.elements;
    const forward = new THREE.Vector3(-e[8], -e[9], -e[10]).setY(0);
    if (forward.lengthSq() < 1e-4) return false;
    forward.normalize();

    const globe = this.experience.world.globe;
    if (!globe) return false;
    globe.group.position
      .copy(headPos)
      .addScaledVector(forward, 0.7)
      .add(new THREE.Vector3(0, -0.12, 0));
    return true;
  }

  update() {
    if (this.renderer.xr.isPresenting && !this._placed) {
      this._framesSeen++;
      if (this._framesSeen > 5 && this.placeGlobe()) {
        this._placed = true;
      }
    }
  }
}
