import * as THREE from "three";
import Experience, { GLOBE_RADIUS } from "../Experience.js";

// Right-hand pinch-anywhere globe rotation — shred's grab-and-pull
// locomotion, re-aimed at an object: pinch, and your hand's translation
// becomes rotation as if the globe's surface were glued to your fingertips.
//
//   r̂     = direction from globe centre to the grab point
//   d_t   = hand delta with the radial component removed
//   axis  = r̂ × d_t,  angle = |d_t| / lever
//
// The anchor re-baselines every frame (shred pattern: exact, drift-free,
// no feedback), and release hands the average angular velocity of the last
// frames to the globe as momentum.
const PINCH_START = 0.018; // m, thumb-tip <-> index-tip
const PINCH_END = 0.032; // hysteresis
const LOST_TIMEOUT = 0.4; // s of missing joints before the grab drops

export default class GlobeGrab {
  constructor() {
    this.experience = new Experience();
    this.hands = this.experience.hands;
    this.debug = this.experience.debug;

    this.grabbing = false;
    this.source = null; // "hand" | "pointer"
    this.anchor = new THREE.Vector3();
    this.params = { gain: 1.0, momentum: true };
    this._lostFor = 0;
    this._velocitySamples = [];
    this._p = new THREE.Vector3();
    this._tipA = new THREE.Vector3();
    this._tipB = new THREE.Vector3();

    if (this.debug.active) {
      const f = this.debug.ui.addFolder("grab");
      f.add(this.params, "gain", 0.25, 3, 0.05);
      f.add(this.params, "momentum");
      f.close();
    }
  }

  // Current right-hand grab point in world space, or null.
  // Prefers real hand joints; falls back to the transient-pointer /
  // controller pose (visionOS system pinch, Quest controller squeeze-less
  // select) while it reports selecting.
  _samplePoint() {
    const hand = this.hands.hand("right");
    if (hand) {
      const gap = this.hands.pinchGap(hand);
      if (gap !== null) {
        hand.joints["index-finger-tip"].getWorldPosition(this._tipA);
        hand.joints["thumb-tip"].getWorldPosition(this._tipB);
        this._p.addVectors(this._tipA, this._tipB).multiplyScalar(0.5);
        return { point: this._p, gap, source: "hand" };
      }
    }
    const ctrl =
      this.hands.controller("right") ?? this.hands.controller("none");
    if (ctrl && ctrl.userData.selecting) {
      ctrl.getWorldPosition(this._p);
      return { point: this._p, gap: 0, source: "pointer" };
    }
    if (ctrl) return { point: null, gap: Infinity, source: "pointer" };
    return null;
  }

  update(dt) {
    if (!this.experience.isXRActive()) {
      this.grabbing = false;
      return;
    }
    const globe = this.experience.world.globe;
    if (!globe) return;

    const sample = this._samplePoint();

    if (!sample || sample.point === null) {
      if (this.grabbing) {
        // A vanished transient-pointer IS the release gesture — throw now.
        // Lost hand joints get a grace period: visionOS drops them transiently.
        if (this.source === "pointer") {
          this._release(globe);
        } else {
          this._lostFor += dt;
          if (this._lostFor > LOST_TIMEOUT) this._release(globe);
        }
      }
      return;
    }
    this._lostFor = 0;

    const wantsGrab =
      sample.source === "pointer" ? sample.gap === 0 : sample.gap < PINCH_START;
    const wantsRelease =
      sample.source === "pointer" ? sample.gap !== 0 : sample.gap > PINCH_END;

    if (!this.grabbing && wantsGrab) {
      this.grabbing = true;
      this.source = sample.source;
      this.anchor.copy(sample.point);
      this._velocitySamples.length = 0;
      globe.setSpin(new THREE.Vector3()); // kill momentum on catch
      return;
    }
    if (this.grabbing && wantsRelease) {
      this._release(globe);
      return;
    }

    if (this.grabbing) {
      const center = globe.group.getWorldPosition(new THREE.Vector3());
      const rHat = this.anchor.clone().sub(center);
      const dist = rHat.length();
      if (dist < 1e-4) {
        this.anchor.copy(sample.point);
        return;
      }
      rHat.divideScalar(dist);

      const d = sample.point.clone().sub(this.anchor);
      const dT = d.clone().addScaledVector(rHat, -d.dot(rHat));
      const len = dT.length();
      if (len > 1e-6) {
        // "surface glued": lever = globe radius, so 1 cm of hand travel is
        // 1 cm of surface travel, whatever the pinch distance.
        const angle = (len / GLOBE_RADIUS) * this.params.gain;
        const axis = new THREE.Vector3().crossVectors(rHat, dT).normalize();
        globe.rotateWorldAxis(axis, angle);
        if (dt > 0) {
          this._velocitySamples.push(axis.multiplyScalar(angle / dt));
          if (this._velocitySamples.length > 5) this._velocitySamples.shift();
        }
      }
      this.anchor.copy(sample.point); // re-anchor every frame
    }
  }

  _release(globe) {
    this.grabbing = false;
    this._lostFor = 0;
    if (this.params.momentum && this._velocitySamples.length) {
      const avg = new THREE.Vector3();
      for (const s of this._velocitySamples) avg.add(s);
      avg.divideScalar(this._velocitySamples.length);
      if (avg.length() > 0.15) globe.setSpin(avg);
    }
    this._velocitySamples.length = 0;
  }
}
