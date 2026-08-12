import * as THREE from "three";
import Experience from "../Experience.js";

// XR hand plumbing. Index 0/1 are never assumed left/right — handedness comes
// from the `connected` event (shred pattern). Joints are rendered as matte
// dots (immersive-vr has no passthrough, so unrendered hands are invisible);
// three's XRHandModelFactory is skipped: its sphere profile is standard-
// material white, ours matches the land-dot info-layer palette.
const JOINT_NAMES = [
  "wrist",
  "thumb-metacarpal",
  "thumb-phalanx-proximal",
  "thumb-phalanx-distal",
  "thumb-tip",
  "index-finger-metacarpal",
  "index-finger-phalanx-proximal",
  "index-finger-phalanx-intermediate",
  "index-finger-phalanx-distal",
  "index-finger-tip",
  "middle-finger-metacarpal",
  "middle-finger-phalanx-proximal",
  "middle-finger-phalanx-intermediate",
  "middle-finger-phalanx-distal",
  "middle-finger-tip",
  "ring-finger-metacarpal",
  "ring-finger-phalanx-proximal",
  "ring-finger-phalanx-intermediate",
  "ring-finger-phalanx-distal",
  "ring-finger-tip",
  "pinky-finger-metacarpal",
  "pinky-finger-phalanx-proximal",
  "pinky-finger-phalanx-intermediate",
  "pinky-finger-phalanx-distal",
  "pinky-finger-tip",
];

export default class Hands {
  constructor() {
    this.experience = new Experience();
    const xr = this.experience.renderer.instance.xr;

    const dotGeo = new THREE.SphereGeometry(1, 10, 8);
    const dotMat = new THREE.MeshBasicMaterial({
      color: "#93a8c2",
      transparent: true,
      opacity: 0.85,
    });

    this.hands = [0, 1].map((i) => {
      const hand = xr.getHand(i);
      hand.userData.handedness = null;
      hand.addEventListener("connected", (e) => {
        hand.userData.handedness = e.data?.handedness ?? null;
      });
      hand.addEventListener("disconnected", () => {
        hand.userData.handedness = null;
      });

      // Joint dots live in the hand group: three writes joint poses in the
      // hand's local (reference) space.
      const dots = new THREE.InstancedMesh(dotGeo, dotMat, JOINT_NAMES.length);
      dots.frustumCulled = false;
      dots.visible = false;
      hand.add(dots);
      hand.userData.dots = dots;

      this.experience.cameraGroup.add(hand);
      return hand;
    });

    // Controllers double as the transient-pointer path: on visionOS Safari a
    // system pinch (without hand-tracking permission) arrives as a transient
    // input source firing selectstart/selectend with a targetRaySpace pose.
    this.controllers = [0, 1].map((i) => {
      const c = xr.getController(i);
      c.userData.handedness = null;
      c.userData.selecting = false;
      c.addEventListener("connected", (e) => {
        c.userData.handedness = e.data?.handedness ?? null;
        c.userData.isTransient = e.data?.targetRayMode === "transient-pointer";
      });
      c.addEventListener("disconnected", () => {
        c.userData.handedness = null;
        c.userData.selecting = false;
      });
      c.addEventListener("selectstart", () => (c.userData.selecting = true));
      c.addEventListener("selectend", () => (c.userData.selecting = false));
      this.experience.cameraGroup.add(c);
      return c;
    });

    this._m = new THREE.Matrix4();
    this._scale = new THREE.Vector3();
  }

  hand(handedness) {
    return this.hands.find((h) => h.userData.handedness === handedness) ?? null;
  }

  controller(handedness) {
    return (
      this.controllers.find((c) => c.userData.handedness === handedness) ?? null
    );
  }

  // Pinch state from raw joints (thumb tip <-> index tip), with hysteresis —
  // mirrors three's internal pinch events but lets us read gap distance and
  // handle joint dropout with a grace period at the caller.
  pinchGap(hand) {
    const a = hand?.joints?.["index-finger-tip"];
    const b = hand?.joints?.["thumb-tip"];
    if (!a || !b) return null;
    return a.position.distanceTo(b.position);
  }

  update() {
    const presenting = this.experience.isXRActive();
    for (const hand of this.hands) {
      const dots = hand.userData.dots;
      const tracked = presenting && hand.userData.handedness !== null;
      dots.visible = tracked;
      if (!tracked) continue;

      JOINT_NAMES.forEach((name, i) => {
        const joint = hand.joints?.[name];
        if (joint && joint.visible !== false) {
          const r = (joint.jointRadius ?? 0.008) * 0.85;
          this._scale.setScalar(r);
          this._m.compose(joint.position, joint.quaternion, this._scale);
        } else {
          this._m.makeScale(0, 0, 0);
        }
        dots.setMatrixAt(i, this._m);
      });
      dots.instanceMatrix.needsUpdate = true;
    }
  }
}
