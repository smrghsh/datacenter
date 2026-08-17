import * as THREE from "three";
import Experience from "../Experience.js";

// Hand menu: turn the LEFT palm toward your face and a small plane fades in
// above it with the view toggle; tap a row with the RIGHT index fingertip.
// Palm-facing test: for the left hand, (indexMcp−wrist)×(pinkyMcp−wrist)
// points out of the palm; dot it against the palm→head direction, with
// hysteresis so the menu doesn't flicker at the threshold.
const SHOW_DOT = 0.55;
const HIDE_DOT = 0.3;
const CANVAS_W = 512;
const CANVAS_H = 340;
const PLANE_W = 0.13; // metres
const PLANE_H = (PLANE_W * CANVAS_H) / CANVAS_W;
const TAP_DEPTH = 0.022; // fingertip within this of the plane counts as touch
const REARM_DEPTH = 0.04; // must retreat past this before the next tap

// button rows in canvas pixels: [label, y0, y1]
const ROWS = [
  ["columns", 96, 208],
  ["heatmap", 208, 320],
];

export default class PalmMenu {
  constructor() {
    this.experience = new Experience();
    this.hands = this.experience.hands;

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 4;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PLANE_W, PLANE_H),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
      })
    );
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
    this.experience.scene.add(this.mesh);

    this.showing = false;
    this._armed = true;
    this._v = {
      wrist: new THREE.Vector3(),
      index: new THREE.Vector3(),
      pinky: new THREE.Vector3(),
      palm: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      head: new THREE.Vector3(),
      tip: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
    };

    this.draw();
    this.experience.on("viewChanged", () => this.draw());
  }

  draw() {
    const ctx = this.ctx;
    const mono = 'ui-monospace, "SF Mono", Menlo, monospace';
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "rgba(8, 13, 22, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(2, 2, CANVAS_W - 4, CANVAS_H - 4, 34);
    ctx.fill();
    ctx.stroke();

    ctx.font = `500 34px ${mono}`;
    ctx.fillStyle = "rgba(230, 235, 242, 0.5)";
    ctx.fillText("view", 40, 66);

    for (const [label, y0, y1] of ROWS) {
      const active = this.experience.view === label;
      if (active) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        ctx.roundRect(20, y0 + 6, CANVAS_W - 40, y1 - y0 - 12, 22);
        ctx.fill();
      }
      // radio dot
      const cy = (y0 + y1) / 2;
      ctx.beginPath();
      ctx.arc(64, cy, 15, 0, Math.PI * 2);
      ctx.strokeStyle = active ? "#ffcf8a" : "rgba(230, 235, 242, 0.4)";
      ctx.lineWidth = 4;
      ctx.stroke();
      if (active) {
        ctx.beginPath();
        ctx.arc(64, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#ffcf8a";
        ctx.fill();
      }
      ctx.font = `600 44px ${mono}`;
      ctx.fillStyle = active ? "#e6ebf2" : "rgba(230, 235, 242, 0.65)";
      ctx.fillText(label, 108, cy + 15);
    }
    this.texture.needsUpdate = true;
  }

  _palmFacing() {
    const hand = this.hands.hand("left");
    const j = hand?.joints;
    const wrist = j?.["wrist"];
    const index = j?.["index-finger-metacarpal"];
    const pinky = j?.["pinky-finger-metacarpal"];
    const middle = j?.["middle-finger-metacarpal"];
    if (!wrist || !index || !pinky || !middle) return null;

    const v = this._v;
    wrist.getWorldPosition(v.wrist);
    index.getWorldPosition(v.index);
    pinky.getWorldPosition(v.pinky);
    middle.getWorldPosition(v.palm);

    v.a.subVectors(v.index, v.wrist);
    v.b.subVectors(v.pinky, v.wrist);
    v.normal.crossVectors(v.a, v.b).normalize();

    const cam = this.experience.renderer.instance.xr.getCamera();
    v.head.setFromMatrixPosition(cam.matrixWorld);
    const toHead = v.a.subVectors(v.head, v.palm).normalize();
    return v.normal.dot(toHead);
  }

  update() {
    if (!this.experience.isXRActive()) {
      this.mesh.visible = this.showing = false;
      return;
    }

    const dot = this._palmFacing();
    if (dot === null) {
      this.mesh.visible = this.showing = false;
      return;
    }
    if (!this.showing && dot > SHOW_DOT) this.showing = true;
    if (this.showing && dot < HIDE_DOT) this.showing = false;
    this.mesh.visible = this.showing;
    if (!this.showing) return;

    // float above the palm, facing the head
    const v = this._v;
    this.mesh.position.copy(v.palm).addScaledVector(v.normal, 0.11);
    this.mesh.lookAt(v.head);
    this.mesh.updateMatrixWorld();

    // tap with the right index fingertip
    const tip = this.hands.hand("right")?.joints?.["index-finger-tip"];
    if (!tip) return;
    tip.getWorldPosition(v.tip);
    const local = this.mesh.worldToLocal(v.tip);
    const inPlane =
      Math.abs(local.x) < PLANE_W / 2 && Math.abs(local.y) < PLANE_H / 2;
    const depth = Math.abs(local.z);

    if (!this._armed) {
      if (depth > REARM_DEPTH || !inPlane) this._armed = true;
      return;
    }
    if (inPlane && depth < TAP_DEPTH) {
      const py = (0.5 - local.y / PLANE_H) * CANVAS_H; // plane y-up -> canvas y-down
      for (const [label, y0, y1] of ROWS) {
        if (py >= y0 && py < y1) {
          this.experience.setView(label);
          this._armed = false;
          break;
        }
      }
    }
  }
}
