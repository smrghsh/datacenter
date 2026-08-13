import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Experience, { GLOBE_HOME } from "./Experience.js";

export default class Camera {
  constructor() {
    this.experience = new Experience();
    this.sizes = this.experience.sizes;
    this.scene = this.experience.scene;
    this.canvas = this.experience.canvas;

    this.setInstance();
    this.setControls();
  }

  setInstance() {
    this.instance = new THREE.PerspectiveCamera(
      36,
      this.sizes.width / this.sizes.height,
      0.05,
      120
    );
    // Desktop framing: eye-level with the globe, close enough to fill frame.
    this.instance.position.set(
      GLOBE_HOME.x + 0.1,
      GLOBE_HOME.y + 0.12,
      GLOBE_HOME.z + 1.24
    );
    this.experience.cameraGroup.add(this.instance);
  }

  setControls() {
    this.controls = new OrbitControls(this.instance, this.canvas);
    this.controls.target.copy(GLOBE_HOME);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.44;
    this.controls.maxDistance = 3.0;
    // LEFT drag is the globe's (trackball rotation); RIGHT orbits the camera.
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }

  resize() {
    this.instance.aspect = this.sizes.width / this.sizes.height;
    this.instance.updateProjectionMatrix();
  }

  update() {
    this.controls.update();
  }
}
