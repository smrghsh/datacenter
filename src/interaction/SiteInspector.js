import * as THREE from "three";
import Experience, { GLOBE_RADIUS } from "../Experience/Experience.js";
import { latLngToVec3 } from "../Experience/World/geo.js";

// Per-column inspection: hover on desktop, left-index-fingertip touch in XR
// (the right hand is the grab hand). The picked column brightens and shows
// city / country / facility count — an HTML tooltip at the cursor on
// desktop, a billboard label at the column tip in XR.
const PICK_ARC = 0.005; // m of surface arc around a column (desktop hover)
const TOUCH_RADIUS = 0.014; // m fingertip-to-column (XR touch)
const HIGHLIGHT = new THREE.Color("#ffffff");

export default class SiteInspector {
  constructor() {
    this.experience = new Experience();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = -1;
    this._px = 0;
    this._py = 0;
    this._buttons = 0;
    this._pointerActive = false;
    this._tmp = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._color = new THREE.Color();

    this.tooltip = document.getElementById("tooltip");
    window.addEventListener("pointermove", (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this._px = e.clientX;
      this._py = e.clientY;
      this._buttons = e.buttons;
      this._pointerActive = true;
    });
    document.addEventListener("mouseleave", () => (this._pointerActive = false));

    this.setLabel();
  }

  // XR label: canvas texture on a small billboard plane above the column.
  setLabel() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1024;
    this.canvas.height = 224;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 4;
    this.label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.0175),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
      })
    );
    this.label.renderOrder = 10;
    this.label.visible = false;
    this.experience.scene.add(this.label);
  }

  // Lazily cache column directions (unit vectors) and heights.
  _dataPoints() {
    const dp = this.experience.world.globe?.dataPoints;
    if (dp && !this._dirs) {
      const n = dp.sites.length;
      this._dirs = new Float32Array(n * 3);
      this._heights = new Float32Array(n);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        latLngToVec3(dp.sites[i].lat, dp.sites[i].lng, 1, v);
        this._dirs[i * 3] = v.x;
        this._dirs[i * 3 + 1] = v.y;
        this._dirs[i * 3 + 2] = v.z;
        this._heights[i] = dp.heightFor(i);
      }
    }
    return dp;
  }

  // Desktop: ray -> globe sphere, nearest column within PICK_ARC of the hit.
  _pickDesktop(globe) {
    if (!this._pointerActive || this._buttons !== 0) return -1;
    this.raycaster.setFromCamera(this.pointer, this.experience.camera.instance);
    const inv = this._invMatrix ?? (this._invMatrix = new THREE.Matrix4());
    inv.copy(globe.group.matrixWorld).invert();
    const ray = this.raycaster.ray.clone().applyMatrix4(inv);
    const sphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_RADIUS);
    if (!ray.intersectSphere(sphere, this._tmp)) return -1;
    this._tmp.normalize();

    let best = -1;
    let bestDot = Math.cos(PICK_ARC / GLOBE_RADIUS);
    const d = this._dirs;
    for (let i = 0; i < this._heights.length; i++) {
      const dot =
        this._tmp.x * d[i * 3] + this._tmp.y * d[i * 3 + 1] + this._tmp.z * d[i * 3 + 2];
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    return best;
  }

  // XR: nearest column segment (base -> tip) to the left index fingertip.
  _pickXR(globe) {
    const hand = this.experience.hands.hand("left");
    const tip = hand?.joints?.["index-finger-tip"];
    if (!tip || tip.visible === false) return -1;
    tip.getWorldPosition(this._tmp);
    const p = globe.group.worldToLocal(this._tmp);
    const pr = p.length();
    if (pr > GLOBE_RADIUS + 0.06 || pr < GLOBE_RADIUS - 0.03) return -1;

    let best = -1;
    let bestD = TOUCH_RADIUS * TOUCH_RADIUS;
    const d = this._dirs;
    for (let i = 0; i < this._heights.length; i++) {
      const dx = d[i * 3];
      const dy = d[i * 3 + 1];
      const dz = d[i * 3 + 2];
      // closest point on the column's radial segment to p
      const along = p.x * dx + p.y * dy + p.z * dz - GLOBE_RADIUS;
      const t = Math.min(Math.max(along, 0), this._heights[i]) + GLOBE_RADIUS;
      const ex = p.x - dx * t;
      const ey = p.y - dy * t;
      const ez = p.z - dz * t;
      const distSq = ex * ex + ey * ey + ez * ez;
      if (distSq < bestD) {
        bestD = distSq;
        best = i;
      }
    }
    return best;
  }

  _setHover(i, dp) {
    if (i === this.hovered) return;
    if (this.hovered >= 0) {
      dp.colorFor(this.hovered, this._color);
      dp.mesh.setColorAt(this.hovered, this._color);
    }
    if (i >= 0) {
      dp.mesh.setColorAt(i, HIGHLIGHT);
      const site = dp.sites[i];
      const place = site.city ? `${site.city}, ${site.country}` : site.country;
      const count = `${site.n.toLocaleString()} ${site.n === 1 ? "facility" : "facilities"}`;
      this.tooltip.innerHTML =
        `<span class="t-name"></span><br /><span class="t-count"></span>`;
      this.tooltip.querySelector(".t-name").textContent = place;
      this.tooltip.querySelector(".t-count").textContent = count;
      this._drawLabel(place, count);
    }
    if (dp.mesh.instanceColor) dp.mesh.instanceColor.needsUpdate = true;
    this.hovered = i;
  }

  _drawLabel(place, count) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(8, 13, 22, 0.82)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, 30);
    ctx.fill();
    ctx.stroke();

    const mono = 'ui-monospace, "SF Mono", Menlo, monospace';
    let size = 64;
    ctx.font = `600 ${size}px ${mono}`;
    while (ctx.measureText(place).width > w - 80 && size > 30) {
      size -= 4;
      ctx.font = `600 ${size}px ${mono}`;
    }
    ctx.fillStyle = "#e6ebf2";
    ctx.fillText(place, 40, 96);
    ctx.font = `500 46px ${mono}`;
    ctx.fillStyle = "#ffcf8a";
    ctx.fillText(count, 40, 172);
    this.texture.needsUpdate = true;
  }

  _placeLabel(globe, i) {
    const d = this._dirs;
    this._tmp
      .set(d[i * 3], d[i * 3 + 1], d[i * 3 + 2])
      .multiplyScalar(GLOBE_RADIUS + this._heights[i] + 0.014);
    globe.group.localToWorld(this._tmp);
    this.label.position.copy(this._tmp);
    const cam = this.experience.renderer.instance.xr.getCamera();
    this._camPos.setFromMatrixPosition(cam.matrixWorld);
    this.label.lookAt(this._camPos);
  }

  update() {
    const globe = this.experience.world.globe;
    const dp = this._dataPoints();
    if (!globe || !dp) return;

    const xr = this.experience.isXRActive();
    const i = xr ? this._pickXR(globe) : this._pickDesktop(globe);
    this._setHover(i, dp);

    const desktopHit = !xr && i >= 0;
    this.tooltip.hidden = !desktopHit;
    if (desktopHit) {
      this.tooltip.style.transform = `translate(${this._px + 14}px, ${this._py + 16}px)`;
    }

    this.label.visible = xr && i >= 0;
    if (this.label.visible) this._placeLabel(globe, i);
  }
}
