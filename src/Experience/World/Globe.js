import * as THREE from "three";
import Experience, { GLOBE_RADIUS, GLOBE_HOME } from "../Experience.js";
import { latLngToVec3 } from "./geo.js";
import DataPoints from "./DataPoints.js";
import Graticule from "./Graticule.js";
import Heatmap from "./Heatmap.js";
import Cables from "./Cables.js";
import CloudRegions from "./CloudRegions.js";

// Matte scientific palette. Land/ocean/graticule are recessive context; the
// data (amber columns) is the only saturated layer.
export const PALETTE = {
  ocean: "#101c30",
  land: "#93a8c2",
  graticule: "#33465e",
  atmosphere: "#54749c",
};

export default class Globe {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.resources = this.experience.resources;
    this.debug = this.experience.debug;

    // Everything that should spin lives under this group; grab interactions
    // rotate `group.quaternion` in world space.
    this.group = new THREE.Group();
    this.group.position.copy(GLOBE_HOME);
    this.scene.add(this.group);

    this.spinVelocity = new THREE.Vector3(); // world-space angular velocity (rad/s)
    this.autoRotateSpeed = 0.12; // rad/s idle spin
    this.idleTime = 10; // start autorotating after this many idle seconds
    this._sinceInteraction = this.idleTime;

    this.setSphere();
    this.setLand();
    this.setAtmosphere();
    this.graticule = new Graticule(this.group);
    this.dataPoints = new DataPoints(this.group);
    this.heatmap = new Heatmap(this.group);
    this.cables = new Cables(this.group);
    this.cloudRegions = new CloudRegions(this.group);

    if (this.debug.active) {
      const f = this.debug.ui.addFolder("globe");
      f.add(this.group.position, "y", 0.6, 1.8, 0.01).name("height");
      f.add(this.group.position, "z", -1.5, 0.0, 0.01).name("depth");
      f.add(this, "autoRotateSpeed", 0, 0.5, 0.005);
      f.addColor(PALETTE, "ocean").onChange((v) => this.sphere.material.color.set(v));
      f.addColor(PALETTE, "land").onChange((v) =>
        this.land.material.uniforms.uColor.value.set(v)
      );
      f.add(this.land.material.uniforms.uSize, "value", 0.0004, 0.005, 0.0002).name("landDotSize");
      f.add(this.atmosphere.material.uniforms.uIntensity, "value", 0, 2, 0.01).name("atmosphere");
      f.close();
    }
  }

  setSphere() {
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96),
      new THREE.MeshStandardMaterial({
        color: PALETTE.ocean,
        roughness: 1.0,
        metalness: 0.0,
      })
    );
    this.group.add(this.sphere);
  }

  setLand() {
    const buf = this.resources.items.land; // Int16 pairs: lat*100, lng*100
    const pairs = new Int16Array(buf);
    const count = pairs.length / 2;
    const positions = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      latLngToVec3(pairs[i * 2] / 100, pairs[i * 2 + 1] / 100, GLOBE_RADIUS * 1.001, v);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Matte round dots, sized in world units so they hold up in XR.
    this.land = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color(PALETTE.land) },
          uSize: { value: 0.0022 }, // dot diameter, metres
          uVh: { value: window.innerHeight }, // viewport px height, set per-frame
        },
        vertexShader: /* glsl */ `
          uniform float uSize;
          uniform float uVh;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * (projectionMatrix[1][1] * 0.5) * uVh /
              max(-mv.z, 0.0001);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = 1.0 - smoothstep(0.38, 0.5, d);
            if (a < 0.01) discard;
            gl_FragColor = vec4(uColor, a * 0.9);
          }
        `,
      })
    );
    this.group.add(this.land);
  }

  setAtmosphere() {
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.0, 64, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color(PALETTE.atmosphere) },
          uIntensity: { value: 0.95 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vP;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position * 1.06, 1.0);
            vP = mv.xyz;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uIntensity;
          varying vec3 vN;
          varying vec3 vP;
          void main() {
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 3.5);
            gl_FragColor = vec4(uColor * f * uIntensity, f * 0.55 * uIntensity);
          }
        `,
      })
    );
    this.group.add(this.atmosphere);
  }

  // Called by grab interactions: world-space axis+angle applied directly.
  rotateWorldAxis(axis, angle) {
    if (angle === 0) return;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    this.group.quaternion.premultiply(q);
    this._sinceInteraction = 0;
  }

  // Angular momentum handoff at release (world-space rad/s vector).
  setSpin(velocity) {
    this.spinVelocity.copy(velocity);
    this._sinceInteraction = 0;
  }

  update(dt) {
    this._sinceInteraction += dt;

    // Keep world-unit point sizing correct across resize and XR framebuffers.
    const xr = this.experience.renderer.instance.xr;
    const layer = xr.isPresenting ? xr.getSession()?.renderState.baseLayer : null;
    this.land.material.uniforms.uVh.value = layer
      ? layer.framebufferHeight
      : this.experience.renderer.instance.domElement.height;

    // Release momentum with exponential damping.
    const w = this.spinVelocity.length();
    if (w > 0.0005) {
      const q = new THREE.Quaternion().setFromAxisAngle(
        this.spinVelocity.clone().normalize(),
        w * dt
      );
      this.group.quaternion.premultiply(q);
      this.spinVelocity.multiplyScalar(Math.exp(-dt * 1.6));
    } else if (this._sinceInteraction > this.idleTime) {
      this.group.rotateOnWorldAxis(
        new THREE.Vector3(0, 1, 0),
        this.autoRotateSpeed * dt
      );
    }

    this.dataPoints.update(dt);
  }
}
