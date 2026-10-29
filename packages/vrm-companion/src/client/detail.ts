import {
  AdditiveBlending,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { createRoomMaterials } from './materials.js';

type Materials = ReturnType<typeof createRoomMaterials>;
export type DetailLight = { daylight: number; twilight: number; wet: number };

const CABLES: Array<Array<[number, number, number]>> = [
  [
    [-0.08, 0, 0.62],
    [-0.1, 0, 0.42],
    [-0.12, 0, 0.22],
    [-0.13, -0.2, 0.14],
    [-0.1, -0.79, 0.08],
  ],
  [
    [0.4, 0.008, 0.22],
    [0.43, -0.12, 0.14],
    [0.47, -0.79, 0.08],
  ],
  [
    [0.4, 0.008, 0.22],
    [0.33, 0.003, 0.4],
    [0.33, 0.003, 0.62],
    [0.38, 0.01, 0.78],
  ],
  [
    [-1.6, -0.5, -1.13],
    [-1.62, -0.6, -1.0],
    [-1.7, -0.79, -0.9],
  ],
];

const SUNSET = new Color(0xff9a50);

export function createDetail(surface: number, materials: Materials) {
  const root = new Group();
  const { toon, dark, cream, wood } = materials;
  const textures: CanvasTexture[] = [];
  const add = (
    geometry: BufferGeometry,
    material: Material,
    x: number,
    y: number,
    z: number,
    parent: Group = root,
  ) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const block = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: Material,
    parent: Group = root,
  ) =>
    add(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(0.012, w / 4, h / 4, d / 4)),
      material,
      x,
      y,
      z,
      parent,
    );
  const warm = (x: number, y: number, z: number, distance: number) => {
    const light = new PointLight(0xffb36a, 0, distance, 2);
    light.position.set(x, y, z);
    root.add(light);
    return light;
  };

  const cable = toon(0x22282d);
  for (const points of CABLES) {
    const curve = new CatmullRomCurve3(
      points.map(([x, y, z]) => new Vector3(x, y + surface + 0.004, z)),
    );
    add(new TubeGeometry(curve, 32, 0.004, 5), cable, 0, 0, 0).castShadow = false;
  }
  block(-1.6, 0.3, -1.13, 0.08, 0.12, 0.012, cream);
  block(-1.6, 0.3, -1.12, 0.03, 0.04, 0.02, toon(0x3a3f47));

  const sconce = new Group();
  sconce.position.set(-2.07, 1.8, -0.42);
  root.add(sconce);
  block(0.01, 0, 0, 0.02, 0.12, 0.08, materials.brass, sconce);
  const arm = add(
    new CylinderGeometry(0.006, 0.006, 0.12, 6),
    materials.brass,
    0.06,
    0.04,
    0,
    sconce,
  );
  arm.rotation.z = Math.PI / 2;
  const sconceShade = toon(0xf1d9b0, { side: DoubleSide });
  add(new CylinderGeometry(0.045, 0.07, 0.09, 16, 1, true), sconceShade, 0.12, 0.06, 0, sconce);
  const sconceBulb = new MeshBasicMaterial({ color: 0xffd9a0 });
  add(new SphereGeometry(0.018, 10, 8), sconceBulb, 0.12, 0.04, 0, sconce).castShadow = false;
  const sconceLight = warm(-1.9, 1.78, -0.42, 2.4);

  const hutchGlow = warm(-1.8, surface + 0.36, -0.42, 0.9);
  const strip = new MeshBasicMaterial({ color: 0xffcf8a });
  add(new RoundedBoxGeometry(0.012, 0.006, 0.8, 1, 0.002), strip, -1.93, 1.598, 0.36).castShadow =
    false;
  const shelfGlow = warm(-1.9, 1.5, 0.36, 1.1);

  const ac = new Group();
  ac.position.set(-2.0, 2.5, 0.35);
  ac.rotation.y = Math.PI / 2;
  root.add(ac);
  block(0, 0, 0, 0.78, 0.25, 0.2, toon(0xeeece6), ac);
  block(0, -0.105, 0.06, 0.7, 0.03, 0.08, toon(0xd6d3cb), ac);
  const louver = block(0, -0.11, 0.1, 0.66, 0.012, 0.05, toon(0xc9c5bc), ac);
  for (let i = 0; i < 5; i++)
    block(-0.25 + i * 0.125, 0.06, 0.101, 0.1, 0.004, 0.002, toon(0xd6d3cb), ac);
  const led = new MeshBasicMaterial({ color: 0x6ee08a });
  add(new SphereGeometry(0.005, 6, 4), led, 0.3, -0.06, 0.101, ac).castShadow = false;

  const basket = new Group();
  basket.position.set(-1.25, 0, -0.55);
  root.add(basket);
  add(
    new CylinderGeometry(0.2, 0.16, 0.26, 18, 1, true),
    toon(0xc8a46e, { side: DoubleSide }),
    0,
    0.13,
    0,
    basket,
  );
  add(new CylinderGeometry(0.16, 0.16, 0.01, 18), toon(0xb08e5c), 0, 0.005, 0, basket);
  for (const y of [0.06, 0.13, 0.2]) {
    const band = add(
      new TorusGeometry(0.19 - y * 0.12, 0.006, 4, 24),
      toon(0xa88352),
      0,
      y,
      0,
      basket,
    );
    band.rotation.x = Math.PI / 2;
  }
  const blanket = add(
    new CylinderGeometry(0.08, 0.08, 0.36, 14),
    toon(0x8aa3b8),
    0.02,
    0.27,
    0,
    basket,
  );
  blanket.rotation.set(0.3, 0.4, Math.PI / 2 - 0.4);
  add(
    new CylinderGeometry(0.07, 0.07, 0.3, 14),
    toon(0xe3c7a8),
    -0.05,
    0.3,
    0.06,
    basket,
  ).rotation.set(-0.2, 1.2, Math.PI / 2 + 0.3);

  for (const [x, z, yaw] of [
    [1.02, -0.62, 0.3],
    [1.16, -0.58, 0.05],
  ] as const) {
    const slipper = new Group();
    slipper.position.set(x, 0, z);
    slipper.rotation.y = yaw;
    root.add(slipper);
    block(0, 0.012, 0, 0.09, 0.024, 0.24, toon(0xe8dccb), slipper);
    const strap = add(
      new CylinderGeometry(0.048, 0.048, 0.08, 14, 1, true, -Math.PI / 2, Math.PI),
      toon(0x7d9bb0, { side: DoubleSide }),
      0,
      0.025,
      0.04,
      slipper,
    );
    strap.rotation.x = Math.PI / 2;
  }

  const floorCushion = add(
    new CylinderGeometry(0.28, 0.3, 0.07, 20),
    toon(0xb05a4a),
    1.45,
    0.035,
    0.95,
  );
  floorCushion.scale.set(1, 1, 0.9);
  add(new CylinderGeometry(0.02, 0.02, 0.072, 8), toon(0x8a3f34), 1.45, 0.037, 0.95);

  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 16;
  beamCanvas.height = 128;
  const beamPaint = beamCanvas.getContext('2d')!;
  const fade = beamPaint.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, 'rgba(255,255,255,0.9)');
  fade.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  beamPaint.fillStyle = fade;
  beamPaint.fillRect(0, 0, 16, 128);
  const edge = beamPaint.createLinearGradient(0, 0, 16, 0);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(0.5, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  beamPaint.globalCompositeOperation = 'destination-out';
  beamPaint.fillStyle = edge;
  beamPaint.fillRect(0, 0, 16, 128);
  const beamTexture = new CanvasTexture(beamCanvas);
  beamTexture.colorSpace = SRGBColorSpace;
  textures.push(beamTexture);
  const beamMaterial = new MeshBasicMaterial({
    map: beamTexture,
    color: 0xffb070,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const beams = new Group();
  root.add(beams);
  for (const [x, width] of [
    [-0.75, 0.5],
    [-0.1, 0.38],
    [0.55, 0.55],
  ] as const) {
    for (const turn of [0, Math.PI / 2]) {
      const beam = new Mesh(new PlaneGeometry(width, 2.4), beamMaterial);
      beam.position.set(x + 0.25, 1.35, -0.55);
      beam.rotation.set(-0.72, turn, 0.18, 'YXZ');
      beam.renderOrder = 3;
      beams.add(beam);
    }
  }
  const windowGlow = new PointLight(0xffa860, 0, 3, 2);
  windowGlow.position.set(0, 1.6, -0.85);
  root.add(windowGlow);

  return {
    root,
    textures,
    update(seconds: number, { daylight, twilight, wet }: DetailLight) {
      const night = Math.max(0, 1 - daylight - twilight * 0.4);
      sconceLight.intensity = night * 0.9 + twilight * 0.25;
      sconceBulb.color.setHex(0xffd9a0).multiplyScalar(0.6 + night * 2.4);
      sconceShade.emissive.setHex(0x8a5420).multiplyScalar(night * 0.8);
      hutchGlow.intensity = night * 0.45;
      shelfGlow.intensity = night * 0.5;
      strip.color.setHex(0xffcf8a).multiplyScalar(0.5 + night * 1.8);
      led.color.setHex(0x6ee08a).multiplyScalar(0.6 + 0.4 * Math.sin(seconds * 2));
      louver.rotation.x = 0.25 + Math.sin(seconds * 0.4) * 0.12;
      const sun = (twilight * 0.2 + daylight * 0.07) * (1 - wet);
      beamMaterial.opacity = sun * (0.85 + Math.sin(seconds * 0.3) * 0.15);
      beams.visible = sun > 0.005;
      beamMaterial.color.setHex(0xfff0d0).lerp(SUNSET, Math.min(1, twilight * 1.2));
      windowGlow.intensity = (daylight * 0.5 + twilight * 1.1) * (1 - wet * 0.7);
      windowGlow.color.setHex(0xfff0d8).lerp(beamMaterial.color, twilight);
    },
  };
}
