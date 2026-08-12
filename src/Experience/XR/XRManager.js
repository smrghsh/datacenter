import * as THREE from "three";
import Experience, { GLOBE_HOME } from "../Experience.js";

// Session lifecycle. Hand-rolled button (not three's VRButton): we want the
// requestSession failure surfaced, and AVP Safari benefits from explicit
// optionalFeatures. On the first XR frames we re-place the globe relative to
// the actual head pose — floor origins differ per device/seating.
export default class XRManager {
  constructor() {
    this.experience = new Experience();
    this.renderer = this.experience.renderer.instance;
    this.session = null;
    this._placed = false;
    this._framesSeen = 0;

    this.setButton();

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

  setButton() {
    const button = document.getElementById("enter-xr");
    if (!button) return;
    if (!("xr" in navigator)) {
      button.textContent = "webxr unavailable";
      button.disabled = true;
      return;
    }
    navigator.xr
      .isSessionSupported("immersive-vr")
      .then((ok) => {
        if (!ok) {
          button.textContent = "immersive-vr unsupported";
          button.disabled = true;
        }
      })
      .catch(() => {});

    button.addEventListener("click", async () => {
      if (this.session) {
        this.session.end();
        return;
      }
      try {
        this.session = await navigator.xr.requestSession("immersive-vr", {
          optionalFeatures: ["hand-tracking", "local-floor"],
        });
        this.session.addEventListener("end", () => {
          this.session = null;
          button.textContent = "enter immersive";
        });
        await this.renderer.xr.setSession(this.session);
        button.textContent = "exit immersive";
        this.experience.trigger("xrSessionStarted");
      } catch (err) {
        console.error("[xr] requestSession failed:", err);
        button.textContent = `xr failed: ${err.message ?? err}`.slice(0, 60);
      }
    });
  }

  // Place the globe 0.55 m along the head's horizontal forward, slightly
  // below eye level. Wait a few frames for a real pose (first frames can be
  // identity on some devices).
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
      .addScaledVector(forward, 0.55)
      .add(new THREE.Vector3(0, -0.06, 0));
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
