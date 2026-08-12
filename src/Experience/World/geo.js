import * as THREE from "three";

// lat/lng (degrees) -> position on a sphere of radius r, three.js Y-up.
// Same convention as the GitHub globe: lng 0 faces -Z at theta=180.
export function latLngToVec3(lat, lng, r, target = new THREE.Vector3()) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  target.set(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
  return target;
}
