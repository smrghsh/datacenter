import * as THREE from "three";
import Experience from "../Experience.js";

// The sky, composed like a photograph rather than scattered at random:
// a seeded starfield (background dust + a layer of bright named-feeling
// stars), a Milky Way band built from haze + grain arcing diagonally behind
// the globe's home view, and a few galaxy sprites placed deliberately.
const SKY_R = 40; // metres

// deterministic RNG — the sky is art-directed, a reload shouldn't recast it
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randDir(rng, target) {
  const u = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return target.set(s * Math.cos(t), u, s * Math.sin(t));
}

// crude blackbody: cool blue-white .. white .. warm
function starColor(rng, color) {
  const t = rng();
  if (t < 0.12) color.setRGB(0.68, 0.78, 1.0);
  else if (t < 0.5) color.setRGB(0.9, 0.94, 1.0);
  else if (t < 0.85) color.setRGB(1.0, 0.96, 0.88);
  else color.setRGB(1.0, 0.82, 0.66);
  return color;
}

export default class Stars {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.debug = this.experience.debug;

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.driftSpeed = 0.0035; // rad/s

    // Band plane: normal chosen so the Milky Way sweeps upper-left to
    // lower-right behind the globe when looking down -Z from GLOBE_HOME
    // (tuned live against the home framing).
    this.bandQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-0.52, -0.85, 0.09).normalize()
    );

    this.materials = [];
    this.setDust();
    this.setBrightStars();
    this.setMilkyWay();
    this.setGalaxies();

    if (this.debug.active) {
      const f = this.debug.ui.addFolder("sky");
      f.add(this.dust.material.uniforms.uBrightness, "value", 0, 3, 0.01).name("dust");
      f.add(this.bright.material.uniforms.uBrightness, "value", 0, 3, 0.01).name("bright stars");
      f.add(this.haze.material.uniforms.uBrightness, "value", 0, 3, 0.01).name("mw haze");
      f.add(this.grain.material.uniforms.uBrightness, "value", 0, 3, 0.01).name("mw grain");
      f.add(this, "driftSpeed", 0, 0.02, 0.0005);
      f.close();
    }
  }

  _makePointsMaterial({ brightness, twinkle, soft }) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBrightness: { value: brightness },
        uTwinkle: { value: twinkle },
        uVh: { value: 1080 },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aPhase;
        uniform float uTime;
        uniform float uTwinkle;
        uniform float uVh;
        varying vec3 vColor;
        varying float vTw;
        void main() {
          vColor = aColor;
          vTw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (0.5 + aPhase * 1.8) + aPhase * 40.0));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * (projectionMatrix[1][1] * 0.5) * uVh / max(-mv.z, 0.0001);
        }
      `,
      fragmentShader: soft
        ? /* glsl */ `
          uniform float uBrightness;
          varying vec3 vColor;
          varying float vTw;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float a = exp(-d * d * 3.0) * (1.0 - smoothstep(0.85, 1.0, d));
            gl_FragColor = vec4(vColor * uBrightness * vTw * a, a);
          }
        `
        : /* glsl */ `
          uniform float uBrightness;
          varying vec3 vColor;
          varying float vTw;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float core = 1.0 - smoothstep(0.0, 0.5, d);
            float halo = exp(-d * d * 2.2) * 0.5;
            float a = core + halo;
            gl_FragColor = vec4(vColor * uBrightness * vTw, a);
          }
        `,
    });
    this.materials.push(mat);
    return mat;
  }

  _fillPoints(count, rng, placer, sizeFn, colorFn) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      placer(v);
      positions.set([v.x, v.y, v.z], i * 3);
      colorFn(c);
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = sizeFn();
      phases[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const pts = new THREE.Points(geo, null);
    pts.frustumCulled = false;
    return pts;
  }

  setDust() {
    const rng = mulberry32(101);
    const pts = this._fillPoints(
      7000,
      rng,
      (v) => randDir(rng, v).multiplyScalar(SKY_R * (0.9 + rng() * 0.2)),
      () => 0.05 + Math.pow(rng(), 2.0) * 0.13,
      (c) => starColor(rng, c)
    );
    pts.material = this._makePointsMaterial({ brightness: 1.0, twinkle: 0.25, soft: false });
    this.dust = pts;
    this.group.add(pts);
  }

  setBrightStars() {
    const rng = mulberry32(202);
    const pts = this._fillPoints(
      260,
      rng,
      (v) => randDir(rng, v).multiplyScalar(SKY_R * (0.9 + rng() * 0.2)),
      () => 0.16 + Math.pow(rng(), 2.6) * 0.55,
      (c) => starColor(rng, c)
    );
    pts.material = this._makePointsMaterial({ brightness: 1.5, twinkle: 0.45, soft: false });
    this.bright = pts;
    this.group.add(pts);
  }

  _bandPoint(rng, v, spread) {
    const theta = rng() * Math.PI * 2;
    const g = (rng() + rng() + rng() - 1.5) / 1.5; // ~gaussian in [-1,1]
    const lat = g * spread;
    v.set(
      Math.cos(theta) * Math.cos(lat),
      Math.sin(lat),
      Math.sin(theta) * Math.cos(lat)
    ).multiplyScalar(SKY_R * (0.9 + rng() * 0.18));
    v.applyQuaternion(this.bandQuat);
    return v;
  }

  setMilkyWay() {
    const rngH = mulberry32(303);
    // haze: few hundred huge soft points — the luminous body of the band
    const haze = this._fillPoints(
      900,
      rngH,
      (v) => this._bandPoint(rngH, v, 0.1),
      () => 2.2 + rngH() * 4.2,
      (c) => {
        const t = rngH();
        if (t < 0.55) c.setRGB(0.72, 0.78, 0.92);
        else if (t < 0.85) c.setRGB(0.9, 0.86, 0.82);
        else c.setRGB(0.95, 0.8, 0.66); // warm core patches
      }
    );
    haze.material = this._makePointsMaterial({ brightness: 0.09, twinkle: 0, soft: true });
    this.haze = haze;
    this.group.add(haze);

    const rngG = mulberry32(404);
    const grain = this._fillPoints(
      22000,
      rngG,
      (v) => this._bandPoint(rngG, v, 0.14),
      () => 0.04 + Math.pow(rngG(), 2.2) * 0.16,
      (c) => starColor(rngG, c)
    );
    grain.material = this._makePointsMaterial({ brightness: 0.65, twinkle: 0.12, soft: false });
    this.grain = grain;
    this.group.add(grain);
  }

  _galaxyTexture(spiral) {
    const S = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const ctx = cv.getContext("2d");
    const cx = S / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, "rgba(255,246,232,0.95)");
    grad.addColorStop(0.18, "rgba(224,226,255,0.5)");
    grad.addColorStop(0.55, "rgba(175,190,235,0.16)");
    grad.addColorStop(1, "rgba(150,170,230,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    if (spiral) {
      ctx.globalCompositeOperation = "lighter";
      for (let a = 0; a < 2; a++) {
        ctx.beginPath();
        for (let t = 0; t < 2.4; t += 0.05) {
          const r = 12 + t * 38;
          const th = t * 2.2 + a * Math.PI;
          ctx.lineTo(cx + r * Math.cos(th), cx + r * Math.sin(th) * 0.55);
        }
        ctx.strokeStyle = "rgba(235,238,255,0.12)";
        ctx.lineWidth = 11;
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  setGalaxies() {
    // Deliberate placements relative to the home view (camera looks -Z):
    // Andromeda upper-right, a companion lower-left, small ellipticals spread.
    const defs = [
      { dir: [0.28, 0.16, -0.94], size: 5.2, opacity: 0.5, squash: 0.42, spiral: true, rot: -0.5 },
      { dir: [-0.3, -0.18, -0.93], size: 2.6, opacity: 0.36, squash: 0.5, spiral: true, rot: 0.7 },
      { dir: [-0.18, 0.24, -0.95], size: 1.6, opacity: 0.3, squash: 0.8, spiral: false, rot: 0 },
      { dir: [0.14, -0.24, -0.95], size: 1.3, opacity: 0.26, squash: 0.62, spiral: false, rot: 0.3 },
      { dir: [0.85, 0.1, 0.5], size: 2.8, opacity: 0.3, squash: 0.4, spiral: true, rot: 1.1 },
      { dir: [-0.5, 0.3, 0.8], size: 1.8, opacity: 0.24, squash: 0.9, spiral: false, rot: 0 },
    ];
    this.galaxies = defs.map((d) => {
      const mat = new THREE.SpriteMaterial({
        map: this._galaxyTexture(d.spiral),
        transparent: true,
        opacity: d.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        rotation: d.rot,
      });
      const spr = new THREE.Sprite(mat);
      spr.position.fromArray(d.dir).normalize().multiplyScalar(SKY_R * 0.97);
      spr.scale.set(d.size, d.size * d.squash, 1);
      this.group.add(spr);
      return spr;
    });
  }

  update(dt) {
    const t = this.experience.time.elapsed / 1000;
    const xr = this.experience.renderer.instance.xr;
    const layer = xr.isPresenting ? xr.getSession()?.renderState.baseLayer : null;
    const vh = layer
      ? layer.framebufferHeight
      : this.experience.renderer.instance.domElement.height;
    for (const m of this.materials) {
      m.uniforms.uTime.value = t;
      m.uniforms.uVh.value = vh;
    }
    this.group.rotateOnAxis(new THREE.Vector3(0.2, 1, 0.1).normalize(), this.driftSpeed * dt);
  }
}
