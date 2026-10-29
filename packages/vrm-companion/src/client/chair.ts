import {
  CatmullRomCurve3,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CHAIR } from './motion.js';
import type { createRoomMaterials } from './materials.js';

export function createChair(seatHeight: number, materials: ReturnType<typeof createRoomMaterials>) {
  const root = new Group();
  root.position.set(CHAIR.x, seatHeight, CHAIR.z);
  const profile = new Shape();
  profile.moveTo(-0.23, 0);
  profile.bezierCurveTo(-0.28, 0.1, -0.19, 0.3, -0.22, 0.43);
  profile.bezierCurveTo(-0.28, 0.54, -0.33, 0.65, -0.25, 0.7);
  profile.bezierCurveTo(-0.16, 0.75, -0.19, 0.87, -0.1, 0.88);
  profile.lineTo(0.1, 0.88);
  profile.bezierCurveTo(0.19, 0.87, 0.16, 0.75, 0.25, 0.7);
  profile.bezierCurveTo(0.33, 0.65, 0.28, 0.54, 0.22, 0.43);
  profile.bezierCurveTo(0.19, 0.3, 0.28, 0.1, 0.23, 0);
  profile.closePath();
  const geometry = new ExtrudeGeometry(profile, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.024,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 5,
  });
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      y = vertices.getY(i);
    vertices.setZ(i, vertices.getZ(i) + x * x * 0.5 - y * 0.14);
    vertices.setY(i, y * 0.82);
  }
  geometry.computeVertexNormals();
  const back = new Mesh(geometry, materials.dark);
  back.position.z = -0.2;
  root.add(back);
  const pad = new Mesh(geometry, materials.fabric);
  pad.scale.set(0.77, 0.92, 0.5);
  pad.position.set(0, 0.025, -0.157);
  root.add(pad);
  const seamPoints = profile
    .getPoints(60)
    .map(
      (p) =>
        new Vector3(p.x * 0.81, p.y * 0.94 * 0.82 + 0.02, -0.115 + p.x * p.x * 0.5 - p.y * 0.14),
    );
  root.add(
    new Mesh(
      new TubeGeometry(new CatmullRomCurve3(seamPoints, true), 40, 0.012, 4, true),
      materials.red,
    ),
  );
  const cushion = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material = materials.fabric,
  ) => {
    const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, 1, Math.min(0.04, h / 3)), material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  cushion(0, -0.035, 0.05, 0.53, 0.1, 0.48, materials.red);
  cushion(0, 0.005, 0.06, 0.43, 0.055, 0.43);
  cushion(0, 0.56, -0.19, 0.25, 0.11, 0.07);
  cushion(0, 0.16, -0.12, 0.31, 0.14, 0.09);
  for (const side of [-1, 1]) {
    cushion(side * 0.28, 0.08, 0.04, 0.025, 0.2, 0.03, materials.brass);
    cushion(side * 0.25, 0.175, 0.04, 0.09, 0.025, 0.03, materials.brass);
    cushion(side * 0.25, 0.19, 0.06, 0.07, 0.045, 0.3);
  }
  root.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = object.receiveShadow = true;
  });
  return root;
}
