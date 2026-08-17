import * as THREE from "three";
import Experience from "../Experience.js";

// Hand menu: turn the LEFT palm toward your face and a plane fades in above
// it mirroring the desktop filter panel; tap rows with the RIGHT index
// fingertip. Palm-facing test: for the left hand, (indexMcp−wrist)×
// (pinkyMcp−wrist) points out of the palm; dot it against the palm→head
// direction, with hysteresis so the menu doesn't flicker at the threshold.
const SHOW_DOT = 0.55;
const HIDE_DOT = 0.3;
const TAP_DEPTH = 0.022; // fingertip within this of the plane counts as touch
const REARM_DEPTH = 0.04; // must retreat past this before the next tap

const CANVAS_W = 560;
const HEADER_H = 64;
const ROW_H = 88;
const PAD = 18;
const PLANE_W = 0.13; // metres

// menu model: radio rows set state[key]=val, check rows toggle state[key]
const MENU = [
  { header: "view" },
  { key: "view", val: "columns", label: "columns" },
  { key: "view", val: "heatmap", label: "heatmap" },
  { header: "metric" },
  { key: "metric", val: "absolute", label: "absolute" },
  { key: "metric", val: "percapita", label: "per capita" },
  { header: "color" },
  { key: "color", val: "density", label: "density" },
  { key: "color", val: "operator", label: "operator" },
  { key: "color", val: "carbon", label: "carbon" },
  { header: "overlays" },
  { toggle: "cables", label: "cables" },
  { toggle: "clouds", label: "cloud regions" },
];

export default class PalmMenu {
  constructor() {
    this.experience = new Experience();
    this.hands = this.experience.hands;

    // compute row layout once
    let y = PAD;
    this.rows = MENU.map((m) => {
      const h = m.header ? HEADER_H : ROW_H;
      const row = { ...m, y0: y, y1: y + h };
      y += h;
      return row;
    });
    this.canvasH = y + PAD;

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_W;
    this.canvas.height = this.canvasH;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 4;

    this.planeW = PLANE_W;
    this.planeH = (PLANE_W * this.canvasH) / CANVAS_W;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.planeW, this.planeH),
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
    this.experience.on("stateChanged", () => this.draw());
  }

  draw() {
    const ctx = this.ctx;
    const s = this.experience.state;
    const mono = 'ui-monospace, "SF Mono", Menlo, monospace';
    const W = CANVAS_W;
    const H = this.canvasH;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(8, 13, 22, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(2, 2, W - 4, H - 4, 34);
    ctx.fill();
    ctx.stroke();

    const colorDisabled = s.view !== "columns";
    for (const row of this.rows) {
      const cy = (row.y0 + row.y1) / 2;
      if (row.header) {
        ctx.font = `500 30px ${mono}`;
        ctx.fillStyle = "rgba(230, 235, 242, 0.45)";
        ctx.fillText(row.header, 36, cy + 16);
        continue;
      }
      const disabled = row.key === "color" && colorDisabled;
      const active = row.toggle ? !!s[row.toggle] : s[row.key] === row.val;
      const alpha = disabled ? 0.28 : 1;

      if (active && !disabled) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        ctx.roundRect(20, row.y0 + 5, W - 40, ROW_H - 10, 20);
        ctx.fill();
      }
      // radio circle / checkbox square
      ctx.lineWidth = 4;
      ctx.strokeStyle = active
        ? `rgba(255, 207, 138, ${alpha})`
        : `rgba(230, 235, 242, ${0.4 * alpha})`;
      if (row.toggle) {
        ctx.beginPath();
        ctx.roundRect(48, cy - 15, 30, 30, 7);
        ctx.stroke();
        if (active) {
          ctx.fillStyle = `rgba(255, 207, 138, ${alpha})`;
          ctx.beginPath();
          ctx.roundRect(56, cy - 7, 14, 14, 3);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(63, cy, 15, 0, Math.PI * 2);
        ctx.stroke();
        if (active) {
          ctx.fillStyle = `rgba(255, 207, 138, ${alpha})`;
          ctx.beginPath();
          ctx.arc(63, cy, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.font = `600 40px ${mono}`;
      ctx.fillStyle = active
        ? `rgba(230, 235, 242, ${alpha})`
        : `rgba(230, 235, 242, ${0.65 * alpha})`;
      ctx.fillText(row.label, 108, cy + 14);
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
    this.mesh.position.copy(v.palm).addScaledVector(v.normal, 0.12);
    this.mesh.lookAt(v.head);
    this.mesh.updateMatrixWorld();

    // tap with the right index fingertip
    const tip = this.hands.hand("right")?.joints?.["index-finger-tip"];
    if (!tip) return;
    tip.getWorldPosition(v.tip);
    const local = this.mesh.worldToLocal(v.tip);
    const inPlane =
      Math.abs(local.x) < this.planeW / 2 && Math.abs(local.y) < this.planeH / 2;
    const depth = Math.abs(local.z);

    if (!this._armed) {
      if (depth > REARM_DEPTH || !inPlane) this._armed = true;
      return;
    }
    if (inPlane && depth < TAP_DEPTH) {
      const py = (0.5 - local.y / this.planeH) * this.canvasH;
      const row = this.rows.find((r) => !r.header && py >= r.y0 && py < r.y1);
      if (!row) return;
      if (row.key === "color" && this.experience.state.view !== "columns") return;
      if (row.toggle) {
        this.experience.setState({ [row.toggle]: !this.experience.state[row.toggle] });
      } else {
        this.experience.setState({ [row.key]: row.val });
      }
      this._armed = false;
    }
  }
}
