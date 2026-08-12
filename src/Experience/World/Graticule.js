import * as THREE from "three";
import { GLOBE_RADIUS } from "../Experience.js";
import { latLngToVec3 } from "./geo.js";

// Faint 15-degree graticule: the "scientific instrument" cue.
export default class Graticule {
  constructor(parent) {
    const positions = [];
    const v = new THREE.Vector3();
    const r = GLOBE_RADIUS * 1.0005;
    const STEP = 15;
    const SEG = 4; // degrees per segment

    // parallels
    for (let lat = -75; lat <= 75; lat += STEP) {
      for (let lng = -180; lng < 180; lng += SEG) {
        latLngToVec3(lat, lng, r, v);
        positions.push(v.x, v.y, v.z);
        latLngToVec3(lat, lng + SEG, r, v);
        positions.push(v.x, v.y, v.z);
      }
    }
    // meridians
    for (let lng = -180; lng < 180; lng += STEP) {
      for (let lat = -90; lat < 90; lat += SEG) {
        latLngToVec3(lat, lng, r, v);
        positions.push(v.x, v.y, v.z);
        latLngToVec3(lat + SEG, lng, r, v);
        positions.push(v.x, v.y, v.z);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: "#33465e",
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
    );
    parent.add(this.lines);
  }
}
