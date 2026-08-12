import * as THREE from "three";
import Experience, { GLOBE_HOME } from "../Experience.js";
import Globe from "./Globe.js";
import Stars from "./Stars.js";

export default class World {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.resources = this.experience.resources;

    // Soft, even light: matte surfaces, no hard speculars.
    this.hemi = new THREE.HemisphereLight("#b8c7dc", "#131c2a", 2.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#f2ead9", 0.65);
    this.sun.position.set(1.5, 2.2, 1.0);
    this.scene.add(this.sun);

    this.stars = new Stars();

    this.resources.on("ready", () => {
      this.globe = new Globe();
      this.experience.trigger("worldReady");
    });
  }

  update(dt) {
    this.stars.update(dt);
    this.globe?.update(dt);
  }
}
