import {
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { createRoomMaterials } from './materials.js';

type Materials = ReturnType<typeof createRoomMaterials>;
const SLEEVES = [0xd9b64a, 0x3f5d7d, 0xc2563f, 0x8a6aa3];
const PHOTOS = ['#f2a46b', '#7fb6c8', '#9fd09a', '#e58aa8', '#c4a1dc'];

const canvasTexture = (
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D) => void,
) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export function createCorner(surface: number, materials: Materials) {
  const root = new Group();
  const { toon, wood, dark, cream } = materials;
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
      new RoundedBoxGeometry(w, h, d, 1, Math.min(0.008, w / 5, h / 5, d / 5)),
      material,
      x,
      y,
      z,
      parent,
    );

  const turntable = new Group();
  turntable.position.set(-1.8, surface, 0.02);
  root.add(turntable);
  block(0, 0.035, 0, 0.36, 0.07, 0.3, toon(0x7a5238), turntable);
  add(new CylinderGeometry(0.125, 0.125, 0.012, 24), dark, -0.03, 0.076, 0, turntable);
  const record = new Group();
  record.position.set(-0.03, 0.084, 0);
  turntable.add(record);
  add(new CylinderGeometry(0.118, 0.118, 0.004, 28), toon(0x1c1f24), 0, 0, 0, record);
  const label = add(
    new CylinderGeometry(0.04, 0.04, 0.005, 16),
    toon(0xc2563f),
    0,
    0.001,
    0,
    record,
  );
  add(new PlaneGeometry(0.03, 0.006), toon(0xf2e6cf), 0.012, 0.0045, 0, record).rotation.x =
    -Math.PI / 2;
  label.castShadow = false;
  for (const radius of [0.06, 0.08, 0.1]) {
    const groove = add(
      new RingGeometry(radius, radius + 0.002, 32),
      toon(0x3a3f47, { side: DoubleSide }),
      0,
      0.0025,
      0,
      record,
    );
    groove.rotation.x = -Math.PI / 2;
  }
  add(new CylinderGeometry(0.012, 0.014, 0.03, 8), cream, 0.13, 0.085, -0.1, turntable);
  const arm = block(0.07, 0.1, -0.03, 0.012, 0.012, 0.17, cream, turntable);
  arm.rotation.y = 0.45;
  block(0.135, 0.075, 0.1, 0.04, 0.012, 0.025, dark, turntable);

  const sleeves = new Group();
  sleeves.position.set(-2.06, surface, 0.26);
  root.add(sleeves);
  for (const [i, color] of SLEEVES.entries()) {
    const sleeve = block(0.004 + i * 0.012, 0.15, i * 0.004, 0.006, 0.3, 0.3, toon(color), sleeves);
    sleeve.rotation.z = -0.12 + i * 0.02;
  }

  const laptop = new Group();
  laptop.position.set(-1.76, surface, 0.56);
  laptop.rotation.y = Math.PI / 2;
  root.add(laptop);
  block(0, 0.008, 0, 0.3, 0.014, 0.21, toon(0xb8bec6), laptop);
  block(0, 0.016, 0.02, 0.26, 0.002, 0.1, toon(0x4a5058), laptop);
  const lid = new Group();
  lid.position.set(0, 0.015, -0.105);
  lid.rotation.x = -0.32;
  laptop.add(lid);
  block(0, 0.1, -0.004, 0.3, 0.2, 0.008, toon(0xb8bec6), lid);
  const laptopScreen = canvasTexture(256, 160, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, '#3b2f5c');
    sky.addColorStop(1, '#e58a6a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = 'rgba(255,240,220,0.9)';
    g.beginPath();
    g.arc(180, 70, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2140';
    g.beginPath();
    g.moveTo(0, 160);
    g.lineTo(60, 100);
    g.lineTo(110, 130);
    g.lineTo(170, 90);
    g.lineTo(256, 140);
    g.lineTo(256, 160);
    g.fill();
    g.fillStyle = 'rgba(20,16,30,0.6)';
    g.fillRect(14, 14, 110, 34);
    g.fillStyle = '#f4e8dc';
    g.fillRect(22, 22, 70, 6);
    g.fillStyle = '#c9b6dc';
    g.fillRect(22, 34, 48, 5);
  });
  const glow = new MeshBasicMaterial({ map: laptopScreen });
  add(new PlaneGeometry(0.27, 0.17), glow, 0, 0.1, 0.001, lid).castShadow = false;

  const speaker = block(-1.98, surface + 0.09, 0.82, 0.12, 0.18, 0.11, toon(0x2f3b3f));
  speaker.rotation.y = 0.5;
  const cone = add(
    new CylinderGeometry(0.035, 0.035, 0.006, 14),
    toon(0x50585f),
    0,
    0.02,
    0.056,
    root,
  );
  speaker.add(cone);
  cone.position.set(0, -0.02, 0.056);
  cone.rotation.x = Math.PI / 2;

  const shelf = new Group();
  shelf.position.set(-2.0, 1.62, 0.36);
  root.add(shelf);
  block(0, 0, 0, 0.2, 0.025, 0.86, wood, shelf);
  for (const z of [-0.3, 0.3]) block(0.02, -0.05, z, 0.14, 0.08, 0.02, dark, shelf);
  let offset = -0.38;
  for (let i = 0; i < 8; i++) {
    const height = 0.14 + ((i * 5) % 4) * 0.02;
    const thick = 0.025 + (i % 3) * 0.008;
    block(
      0,
      0.013 + height / 2,
      offset + thick / 2,
      0.12,
      height,
      thick,
      toon(SLEEVES[i % 4]!),
      shelf,
    );
    offset += thick + 0.003;
  }
  block(0, 0.04, 0.08, 0.1, 0.055, 0.1, toon(0xe3dccb), shelf);
  add(new SphereGeometry(0.035, 8, 6), toon(0xf2e6cf), 0, 0.105, 0.08, shelf);
  add(new SphereGeometry(0.012, 5, 4), toon(0x2f3b3f), 0.03, 0.115, 0.065, shelf);
  add(new CylinderGeometry(0.04, 0.03, 0.07, 8), toon(0xc9a78c), 0, 0.048, 0.3, shelf);
  const shelfLeaf = toon(0x5f8f6e);
  for (let i = 0; i < 6; i++) {
    const leaf = add(new SphereGeometry(0.03, 5, 3), shelfLeaf, 0, 0.1, 0.3, shelf);
    leaf.scale.set(0.5, 1.5, 0.5);
    leaf.rotation.set(Math.cos(i * 1.1) * 0.5, 0, Math.sin(i * 1.1) * 0.5);
  }

  const board = canvasTexture(240, 160, (g) => {
    g.fillStyle = '#b98a5e';
    g.fillRect(0, 0, 240, 160);
    g.fillStyle = 'rgba(80,50,30,0.25)';
    for (let i = 0; i < 160; i++) g.fillRect((i * 97) % 240, (i * 53) % 160, 2, 2);
    for (let i = 0; i < 5; i++) {
      const x = 14 + i * 44;
      const y = 18 + ((i * 37) % 60);
      g.save();
      g.translate(x + 20, y + 24);
      g.rotate(((i % 3) - 1) * 0.12);
      g.fillStyle = '#f6efe0';
      g.fillRect(-20, -24, 40, 48);
      g.fillStyle = PHOTOS[i]!;
      g.fillRect(-16, -20, 32, 32);
      g.fillStyle = '#c2563f';
      g.beginPath();
      g.arc(0, -24, 3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#f0d36a';
    g.fillRect(150, 110, 34, 34);
    g.fillStyle = '#e58aa8';
    g.fillRect(190, 104, 30, 30);
    g.fillStyle = '#6f5a48';
    g.fillRect(156, 122, 20, 3);
    g.fillRect(196, 116, 18, 3);
  });
  const cork = add(new PlaneGeometry(0.6, 0.4), toon(0xffffff, { map: board }), -2.085, 1.16, 0.5);
  cork.rotation.y = Math.PI / 2;
  block(-2.08, 1.16, 0.5, 0.015, 0.43, 0.63, toon(0x7a5238)).position.x = -2.095;

  const hanger = new Group();
  hanger.position.set(0.85, 2.42, -0.86);
  root.add(hanger);
  for (let i = 0; i < 3; i++) {
    const rope = add(new CylinderGeometry(0.002, 0.002, 0.4, 3), toon(0xd8c9a8), 0, 0.2, 0, hanger);
    rope.rotation.set(
      Math.cos((i * Math.PI * 2) / 3) * 0.14,
      0,
      Math.sin((i * Math.PI * 2) / 3) * 0.14,
    );
  }
  add(new CylinderGeometry(0.075, 0.055, 0.1, 10), toon(0xe3dccb), 0, -0.02, 0, hanger);
  const vine = toon(0x4f8a5c);
  const vines: Group[] = [];
  for (let strand = 0; strand < 4; strand++) {
    const group = new Group();
    const angle = strand * 1.7;
    group.position.set(Math.cos(angle) * 0.06, 0.02, Math.sin(angle) * 0.06);
    hanger.add(group);
    vines.push(group);
    const length = 6 + (strand % 3) * 3;
    for (let i = 0; i < length; i++) {
      const leaf = add(new SphereGeometry(0.025, 4, 3), vine, 0, -i * 0.045, 0, group);
      leaf.scale.set(1, 0.45, 0.7);
      leaf.rotation.set(0.4, i * 1.3, 0.3);
      leaf.position.x += Math.sin(i * 1.3) * 0.012 + Math.cos(angle) * i * 0.006;
      leaf.position.z += Math.sin(angle) * i * 0.006;
    }
  }
  const leaves = shelfLeaf;
  for (let i = 0; i < 7; i++) {
    const leaf = add(new SphereGeometry(0.03, 5, 3), leaves, 0, 0.06, 0, hanger);
    leaf.scale.set(1, 0.4, 0.6);
    leaf.rotation.set(0.3, (i * Math.PI * 2) / 7, 0.5);
    leaf.position.x += Math.cos((i * Math.PI * 2) / 7) * 0.05;
    leaf.position.z += Math.sin((i * Math.PI * 2) / 7) * 0.05;
  }

  return {
    root,
    textures: [laptopScreen, board],
    update(seconds: number) {
      record.rotation.y = -seconds * 3.5;
      hanger.rotation.y = Math.sin(seconds * 0.3) * 0.08;
      for (let i = 0; i < vines.length; i++) {
        vines[i]!.rotation.x = Math.sin(seconds * 0.8 + i * 1.3) * 0.06;
        vines[i]!.rotation.z = Math.cos(seconds * 0.6 + i) * 0.05;
      }
    },
  };
}
