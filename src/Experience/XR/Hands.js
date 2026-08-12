import Experience from "../Experience.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";

// XR hand plumbing. Index 0/1 are never assumed left/right — handedness comes
// from the `connected` event (shred pattern). Hands render as three's
// standard skinned mesh (the WebXR generic-hand profile, vendored into
// static/models/generic-hand/ so nothing fetches from a CDN at runtime) —
// immersive-vr has no passthrough, so unrendered hands are invisible.
export default class Hands {
  constructor() {
    this.experience = new Experience();
    const xr = this.experience.renderer.instance.xr;

    const handModelFactory = new XRHandModelFactory().setPath(
      "./models/generic-hand/"
    );

    this.hands = [0, 1].map((i) => {
      const hand = xr.getHand(i);
      hand.userData.handedness = null;
      hand.addEventListener("connected", (e) => {
        hand.userData.handedness = e.data?.handedness ?? null;
      });
      hand.addEventListener("disconnected", () => {
        hand.userData.handedness = null;
      });
      hand.add(handModelFactory.createHandModel(hand, "mesh"));
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

  update() {}
}
