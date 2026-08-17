import * as THREE from "three";

import Sizes from "./Utils/Sizes.js";
import Debug from "./Utils/Debug.js";
import Resources from "./Utils/Resources.js";
import EventEmitter from "./Utils/EventEmitter.js";
import Camera from "./Camera.js";
import Renderer from "./Renderer.js";
import World from "./World/World.js";
import XRManager from "./XR/XRManager.js";
import Hands from "./XR/Hands.js";
import GlobeGrab from "./XR/GlobeGrab.js";
import PalmMenu from "./XR/PalmMenu.js";
import MouseGlobeDrag from "../interaction/MouseGlobeDrag.js";
import SiteInspector from "../interaction/SiteInspector.js";
import sources from "./sources.js";

let instance = null;

// The globe is a hand-held object: 24 inch diameter (0.61 m), floating
// in front of the viewer. All world units are metres (WebXR requirement).
export const GLOBE_RADIUS = 0.3;
export const GLOBE_HOME = new THREE.Vector3(0, 1.25, -0.7);

export default class Experience extends EventEmitter {
  constructor(canvas) {
    super();
    if (instance) return instance;
    instance = this;
    window.experience = this;

    this.canvas = canvas;
    this.view = "columns";
    this.debug = new Debug();
    this.sizes = new Sizes();
    this.scene = new THREE.Scene();
    this.resources = new Resources(sources);

    // XR rig: camera (and hands/controllers) parent. Locomotion-style code
    // moves this group, never the camera.
    this.cameraGroup = new THREE.Group();
    this.scene.add(this.cameraGroup);
    this.camera = new Camera();
    this.renderer = new Renderer();

    this.world = new World();
    this.xr = new XRManager();
    this.hands = new Hands();
    this.globeGrab = new GlobeGrab();
    this.palmMenu = new PalmMenu();
    this.mouseDrag = new MouseGlobeDrag();
    this.siteInspector = new SiteInspector();

    this.sizes.on("resize", () => {
      this.camera.resize();
      this.renderer.resize();
    });

    // setAnimationLoop (not rAF) so the loop survives entering XR.
    this.time = { delta: 16, elapsed: 0 };
    this._lastFrameTime = performance.now();
    this.renderer.instance.setAnimationLoop(() => this.update());
  }

  isXRActive() {
    return this.renderer?.instance.xr.isPresenting === true;
  }

  // "columns" | "heatmap" — one saturated data layer at a time.
  setView(mode) {
    if (mode === this.view) return;
    this.view = mode;
    const globe = this.world.globe;
    if (globe) {
      globe.dataPoints.mesh.visible = mode === "columns";
      globe.heatmap.mesh.visible = mode === "heatmap";
    }
    this.trigger("viewChanged", [mode]);
  }

  update() {
    const now = performance.now();
    this.time.delta = Math.min(now - this._lastFrameTime, 100);
    this.time.elapsed += this.time.delta;
    this._lastFrameTime = now;
    const dt = this.time.delta / 1000;

    this.xr.update();
    this.hands.update(dt);
    this.globeGrab.update(dt);
    this.palmMenu.update();
    if (!this.isXRActive()) this.camera.update();
    this.cameraGroup.updateMatrixWorld();
    this.camera.instance.updateMatrixWorld();
    this.world.update(dt);
    this.siteInspector.update();
    this.renderer.update();
  }
}
