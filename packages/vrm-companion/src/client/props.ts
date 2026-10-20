import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three';
import type { createRoomMaterials } from './materials.js';
import { createPaper } from './paper.js';
import { createCorner } from './corner.js';

type Materials = ReturnType<typeof createRoomMaterials>;
const BOOK_COLORS = [
  0xd9b64a, 0x5f8f6e, 0xe3dccb, 0xc2563f, 0x3f5d7d, 0xe08a3c, 0x8a6aa3, 0x2f3b3f,
];

export function createProps(surface: number, sill: number, materials: Materials) {
  const root = new Group();
  const { toon, wood, dark, cream } = materials;
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
  ) => add(new BoxGeometry(w, h, d), material, x, y, z, parent);
  const spine = document.createElement('canvas');
  spine.width = 32;
  spine.height = 128;
  const ink = spine.getContext('2d')!;
  ink.fillStyle = '#d6d6d6';
  ink.fillRect(0, 0, 32, 128);
  ink.fillStyle = '#ffffff';
  ink.fillRect(0, 14, 32, 26);
  ink.fillStyle = '#5a5050';
  ink.fillRect(8, 22, 16, 3);
  ink.fillRect(10, 29, 12, 2);
  ink.fillStyle = '#9a9090';
  ink.fillRect(0, 8, 32, 2);
  ink.fillRect(0, 108, 32, 2);
  ink.fillRect(12, 114, 8, 8);
  const spineTexture = new CanvasTexture(spine);
  spineTexture.colorSpace = SRGBColorSpace;
  textures.push(spineTexture);
  const palette = BOOK_COLORS.map((color) => toon(color, { map: spineTexture }));
  const books = (
    parent: Group,
    x: number,
    y: number,
    z: number,
    count: number,
    seed: number,
    lean = 0,
  ) => {
    let offset = x;
    for (let i = 0; i < count; i++) {
      const height = 0.15 + ((seed * 7 + i * 13) % 7) * 0.012;
      const thick = 0.018 + ((seed + i * 5) % 4) * 0.007;
      const book = block(
        offset + thick / 2,
        y + height / 2,
        z,
        thick,
        height,
        0.11 + ((seed + i) % 3) * 0.015,
        palette[(seed + i * 3) % palette.length]!,
        parent,
      );
      if (i === count - 1 && lean) {
        book.rotation.z = -lean;
        book.position.x += Math.sin(lean) * height * 0.5;
        book.position.y -= (1 - Math.cos(lean)) * height * 0.5;
      }
      offset += thick + 0.002;
    }
  };

  const hutch = new Group();
  hutch.position.set(-1.84, surface, -0.42);
  hutch.rotation.y = Math.PI / 2;
  root.add(hutch);
  for (const x of [-0.25, 0.25]) block(x, 0.21, 0, 0.022, 0.42, 0.24, wood, hutch);
  for (const y of [0.011, 0.2, 0.41]) block(0, y, 0, 0.522, 0.022, 0.24, wood, hutch);
  block(0, 0.21, -0.115, 0.52, 0.42, 0.01, toon(0x7d5c44), hutch);
  books(hutch, -0.235, 0.022, 0.0, 11, 2, 0.35);
  books(hutch, -0.235, 0.211, 0.0, 6, 5);
  block(0.13, 0.24, 0.02, 0.12, 0.055, 0.1, toon(0xc2563f), hutch);
  block(0.13, 0.29, 0.02, 0.1, 0.045, 0.09, toon(0xe3dccb), hutch);
  const pot = add(new CylinderGeometry(0.055, 0.042, 0.09, 8), cream, -0.12, 0.466, 0, hutch);
  pot.castShadow = true;
  const sprout = toon(0x6aa35c);
  for (let i = 0; i < 5; i++) {
    const leaf = add(new SphereGeometry(0.045, 5, 3), sprout, -0.12, 0.54, 0, hutch);
    leaf.scale.set(1.1, 0.35, 0.55);
    leaf.rotation.set(0.2, (i * Math.PI * 2) / 5, 0.6);
    leaf.position.x += Math.cos((i * Math.PI * 2) / 5) * 0.035;
    leaf.position.z += Math.sin((i * Math.PI * 2) / 5) * 0.035;
  }
  add(new CylinderGeometry(0.028, 0.034, 0.08, 6), toon(0x8a5a3c), 0.12, 0.461, 0, hutch);
  for (let i = 0; i < 4; i++) {
    const reed = add(new CylinderGeometry(0.002, 0.002, 0.2, 3), dark, 0.12, 0.56, 0, hutch);
    reed.rotation.set(Math.sin(i * 2.1) * 0.25, 0, Math.cos(i * 1.7) * 0.25);
  }

  add(
    new CylinderGeometry(0.035, 0.032, 0.1, 8, 1, true),
    toon(0x3f5d7d, { side: DoubleSide }),
    -0.28,
    surface + 0.05,
    0.62,
  );
  const penColors = [0x2f3b3f, 0xc2563f, 0xd9b64a, 0x5f8f6e];
  for (let i = 0; i < 4; i++) {
    const pen = add(
      new CylinderGeometry(0.004, 0.004, 0.14, 5),
      toon(penColors[i]!),
      -0.28,
      surface + 0.09,
      0.62,
    );
    pen.position.x += Math.cos(i * 1.6) * 0.012;
    pen.position.z += Math.sin(i * 1.6) * 0.012;
    pen.rotation.set(Math.sin(i * 1.6) * 0.18, 0, -Math.cos(i * 1.6) * 0.18);
  }
  const phone = new Group();
  phone.position.set(0.32, surface, 0.32);
  phone.rotation.y = 0.3;
  root.add(phone);
  block(0, 0.004, 0, 0.072, 0.008, 0.15, dark, phone);
  const phoneScreen = toon(0x4c6a8a);
  block(0, 0.0085, 0, 0.064, 0.001, 0.135, phoneScreen, phone);
  for (const [i, color] of [0x5f8f6e, 0xe3dccb, 0xc2563f].entries()) {
    const note = block(1.2, surface + 0.008 + i * 0.016, 0.62, 0.21, 0.015, 0.15, toon(color));
    note.rotation.y = 0.12 - i * 0.18;
  }
  add(new CylinderGeometry(0.05, 0.05, 0.004, 10), toon(0x7d5c44), 0.18, surface + 0.002, 0.3);
  const succulent = toon(0x7bab8a);
  add(new CylinderGeometry(0.04, 0.032, 0.06, 6), toon(0xc9a78c), 1.3, surface + 0.03, 0.4);
  for (let i = 0; i < 6; i++) {
    const leaf = add(new SphereGeometry(0.022, 4, 3), succulent, 1.3, surface + 0.07, 0.4);
    leaf.scale.set(0.6, 1.4, 0.6);
    leaf.rotation.set(Math.cos(i) * 0.5, 0, Math.sin(i) * 0.5);
    leaf.position.x += Math.sin(i) * 0.015;
    leaf.position.z += Math.cos(i) * 0.015;
  }

  const row = new Group();
  row.position.set(0, surface, 0.24);
  root.add(row);
  books(row, -0.5, 0, 0, 9, 3, 0.3);
  block(-0.515, 0.06, 0, 0.01, 0.12, 0.1, dark, row);
  const drawers = new Group();
  drawers.position.set(-1.15, 0, 0.55);
  root.add(drawers);
  const height = surface - 0.06;
  block(0, height / 2, 0, 0.42, height, 0.6, wood, drawers);
  for (let i = 0; i < 3; i++) {
    const y = height * (0.18 + i * 0.31);
    block(0, y, 0.302, 0.38, height * 0.28, 0.01, toon(0xb08862), drawers);
    block(0, y + height * 0.06, 0.312, 0.1, 0.012, 0.012, dark, drawers);
  }

  const rug = add(new CylinderGeometry(1.05, 1.05, 0.012, 8), toon(0x6c7a9a), 0.3, 0.006, 0.25);
  rug.scale.set(1.2, 1, 0.85);
  rug.rotation.y = Math.PI / 8;
  add(new CylinderGeometry(0.98, 0.98, 0.014, 8), toon(0x8592b0), 0.3, 0.007, 0.25).scale.set(
    1.2 * 0.82,
    1,
    0.85 * 0.82,
  );
  block(0, 0.06, -1.13, 4.2, 0.12, 0.03, dark);
  block(-2.08, 0.06, -0.25, 0.03, 0.12, 2.1, dark);

  const chart = document.createElement('canvas');
  chart.width = 256;
  chart.height = 320;
  const draw = chart.getContext('2d')!;
  draw.fillStyle = '#1f2b44';
  draw.fillRect(0, 0, 256, 320);
  draw.strokeStyle = '#c9b98a';
  draw.lineWidth = 2;
  for (const r of [40, 75, 105]) {
    draw.beginPath();
    draw.arc(128, 150, r, 0, Math.PI * 2);
    draw.stroke();
  }
  draw.beginPath();
  draw.moveTo(128, 30);
  draw.lineTo(128, 270);
  draw.moveTo(8, 150);
  draw.lineTo(248, 150);
  draw.stroke();
  draw.fillStyle = '#efe6c8';
  for (let i = 0; i < 60; i++)
    draw.fillRect(
      (Math.sin(i * 91.7) * 0.5 + 0.5) * 250,
      (Math.sin(i * 47.3) * 0.5 + 0.5) * 310,
      2,
      2,
    );
  draw.fillRect(70, 290, 116, 6);
  const chartTexture = new CanvasTexture(chart);
  chartTexture.colorSpace = SRGBColorSpace;
  textures.push(chartTexture);
  const poster = new Group();
  poster.position.set(2.08, 1.65, 0.1);
  poster.rotation.y = -Math.PI / 2;
  root.add(poster);
  block(0, 0, 0, 0.5, 0.62, 0.025, dark, poster);
  block(0, 0, 0.014, 0.44, 0.56, 0.002, toon(0xffffff, { map: chartTexture }), poster);

  const sketch = document.createElement('canvas');
  sketch.width = 320;
  sketch.height = 240;
  const pen = sketch.getContext('2d')!;
  pen.fillStyle = '#e9dcc0';
  pen.fillRect(0, 0, 320, 240);
  pen.strokeStyle = '#3a3530';
  pen.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 32;
    const top = 70 + ((i * 37) % 60);
    pen.strokeRect(x, top, 22, 200 - top);
    pen.beginPath();
    pen.moveTo(x + 11, top);
    pen.lineTo(x + 11, top - 25 - (i % 3) * 10);
    pen.stroke();
  }
  pen.beginPath();
  pen.moveTo(0, 200);
  pen.lineTo(320, 196);
  pen.stroke();
  const sketchTexture = new CanvasTexture(sketch);
  sketchTexture.colorSpace = SRGBColorSpace;
  textures.push(sketchTexture);
  const board = new Group();
  board.position.set(-1.72, 1.72, -1.13);
  root.add(board);
  block(0, 0, 0, 0.56, 0.44, 0.02, toon(0x5a4334), board);
  block(0, 0, 0.012, 0.5, 0.38, 0.002, toon(0xffffff, { map: sketchTexture }), board);
  for (const [i, color] of [0xf1d27a, 0x9fd0c0, 0xf0a0a0, 0xf1d27a].entries()) {
    const note = block(
      -0.2 + i * 0.13,
      -0.36 - (i % 2) * 0.05,
      0.012,
      0.08,
      0.08,
      0.002,
      toon(color),
      board,
    );
    note.rotation.z = (i - 1.5) * 0.08;
  }
  const clock = new Group();
  clock.position.set(1.65, 2.05, -1.13);
  clock.rotation.x = Math.PI / 2;
  root.add(clock);
  add(new CylinderGeometry(0.15, 0.15, 0.03, 12), dark, 0, 0, 0, clock);
  add(new CylinderGeometry(0.13, 0.13, 0.032, 12), cream, 0, 0, 0, clock);
  const hourHand = block(0, 0.02, 0, 0.012, 0.004, 0.07, dark, clock);
  const minuteHand = block(0, 0.022, 0, 0.008, 0.004, 0.1, dark, clock);
  hourHand.geometry.translate(0, 0, -0.03);
  minuteHand.geometry.translate(0, 0, -0.045);

  const floorLamp = new Group();
  floorLamp.position.set(1.85, 0, -0.05);
  root.add(floorLamp);
  add(new CylinderGeometry(0.14, 0.16, 0.025, 10), dark, 0, 0.0125, 0, floorLamp);
  add(new CylinderGeometry(0.012, 0.012, 1.35, 6), dark, 0, 0.7, 0, floorLamp);
  const lampShade = add(
    new CylinderGeometry(0.15, 0.22, 0.26, 10, 1, true),
    toon(0xf0c27a, { side: DoubleSide, emissive: 0x6a3a10 }),
    0,
    1.42,
    0,
    floorLamp,
  );
  const shadeMaterial = lampShade.material as import('three').MeshToonMaterial;
  const cornerLight = new PointLight(0xffb36a, 0, 2.4, 2);
  cornerLight.position.set(0, 1.38, 0);
  floorLamp.add(cornerLight);

  const strand = new CatmullRomCurve3(
    Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return new Vector3(-1.3 + t * 2.4, 2.36 - Math.sin(t * Math.PI * 3) ** 2 * 0.12, -1.02);
    }),
  );
  add(new TubeGeometry(strand, 48, 0.003, 3, false), dark, 0, 0, 0);
  const bulbs: MeshBasicMaterial[] = [];
  const bulbColors = [0xffd27a, 0xffb0a0, 0xfff0c0, 0xa8d8ff];
  for (let i = 0; i < 24; i++) {
    const material = new MeshBasicMaterial({ color: bulbColors[i % bulbColors.length]! });
    bulbs.push(material);
    const bulb = new Mesh(new SphereGeometry(0.012, 5, 4), material);
    bulb.position.copy(strand.getPoint((i + 0.5) / 24)).add(new Vector3(0, -0.012, 0));
    root.add(bulb);
  }

  const stack = new Group();
  stack.position.set(0.55, sill + 0.045, -0.95);
  root.add(stack);
  for (let i = 0; i < 3; i++) {
    const book = block(
      0,
      0.014 + i * 0.03,
      0,
      0.22 - i * 0.02,
      0.028,
      0.16 - i * 0.01,
      palette[i * 2 + 1]!,
      stack,
    );
    book.rotation.y = (i - 1) * 0.15;
  }
  add(new CylinderGeometry(0.035, 0.035, 0.07, 8), toon(0xe9dcc0), 1.0, sill + 0.08, -0.92);
  const flame = new Mesh(
    new SphereGeometry(0.008, 4, 3),
    new MeshBasicMaterial({ color: 0xffc070 }),
  );
  flame.scale.set(1, 1.8, 1);
  flame.position.set(1.0, sill + 0.13, -0.92);
  root.add(flame);

  const calendar = new Group();
  calendar.position.set(-0.04, surface, 0.74);
  calendar.rotation.y = 0.9;
  root.add(calendar);
  const now = new Date();
  const page = document.createElement('canvas');
  page.width = 96;
  page.height = 96;
  const marker = page.getContext('2d')!;
  marker.fillStyle = '#f6efe0';
  marker.fillRect(0, 0, 96, 96);
  marker.fillStyle = '#c2563f';
  marker.fillRect(0, 0, 96, 24);
  marker.fillStyle = '#f6efe0';
  marker.font = '600 15px sans-serif';
  marker.textAlign = 'center';
  marker.fillText(now.toLocaleString('en', { month: 'short' }).toUpperCase(), 48, 18);
  marker.fillStyle = '#3a3030';
  marker.font = '700 46px sans-serif';
  marker.fillText(String(now.getDate()), 48, 74);
  marker.fillStyle = '#9a9090';
  marker.fillRect(20, 84, 56, 3);
  const pageTexture = new CanvasTexture(page);
  pageTexture.colorSpace = SRGBColorSpace;
  textures.push(pageTexture);
  for (const side of [-1, 1]) {
    const leaf = block(
      0,
      0.045,
      side * 0.022,
      0.1,
      0.1,
      0.004,
      side > 0 ? toon(0xffffff, { map: pageTexture }) : cream,
      calendar,
    );
    leaf.rotation.x = side * 0.42;
  }
  block(0, 0.002, 0, 0.1, 0.004, 0.08, dark, calendar);

  const jar = new Group();
  jar.position.set(0.28, sill, -0.9);
  root.add(jar);
  add(
    new CylinderGeometry(0.045, 0.045, 0.13, 10, 1, true),
    new MeshBasicMaterial({
      color: 0xcfe0e6,
      transparent: true,
      opacity: 0.25,
      side: DoubleSide,
      depthWrite: false,
    }),
    0,
    0.065,
    0,
    jar,
  ).castShadow = false;
  block(0, 0.135, 0, 0.07, 0.015, 0.07, materials.brass, jar);
  const fireflies: Mesh[] = [];
  const fireflyMaterial = new MeshBasicMaterial({ color: 0xffe08a });
  for (let i = 0; i < 9; i++) {
    const light = new Mesh(new SphereGeometry(0.006, 4, 3), fireflyMaterial);
    light.position.set(Math.cos(i * 2.4) * 0.025, 0.02 + i * 0.011, Math.sin(i * 2.4) * 0.025);
    jar.add(light);
    fireflies.push(light);
  }
  const jarLight = new PointLight(0xffc870, 0, 0.6, 2);
  jarLight.position.set(0, 0.08, 0.05);
  jar.add(jarLight);

  const prints = [
    [1.42, 1.5, 0.26, 0.34, '#e58a6a', '#3b2f5c'],
    [1.82, 1.42, 0.22, 0.28, '#7fb6c8', '#f6efe0'],
    [1.6, 1.12, 0.3, 0.2, '#9fd09a', '#2f3b3f'],
  ] as const;
  for (const [x, y, w, h, a, b] of prints) {
    const art = document.createElement('canvas');
    art.width = 64;
    art.height = 64;
    const brush = art.getContext('2d')!;
    brush.fillStyle = b;
    brush.fillRect(0, 0, 64, 64);
    brush.fillStyle = a;
    brush.beginPath();
    brush.arc(40, 26, 14, 0, Math.PI * 2);
    brush.fill();
    brush.fillRect(0, 44, 64, 20);
    const artTexture = new CanvasTexture(art);
    artTexture.colorSpace = SRGBColorSpace;
    textures.push(artTexture);
    block(x, y, -1.135, w + 0.03, h + 0.03, 0.02, dark);
    add(new PlaneGeometry(w, h), toon(0xffffff, { map: artTexture }), x, y, -1.124);
  }

  const motes = Array.from({ length: 70 }, (_, i) => [
    -0.6 + ((i * 0.618) % 1) * 1.8,
    0.8 + ((i * 0.381) % 1) * 1.3,
    -0.95 + ((i * 0.733) % 1) * 1.2,
    i * 1.7,
  ]);
  const motePositions = new Float32Array(motes.length * 3);
  const moteGeometry = new BufferGeometry();
  moteGeometry.setAttribute('position', new BufferAttribute(motePositions, 3));
  const moteMaterial = new PointsMaterial({
    color: 0xfff0c8,
    size: 0.012,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    opacity: 0,
  });
  const dust = new Points(moteGeometry, moteMaterial);
  dust.frustumCulled = false;
  root.add(dust);
  const paper = createPaper(surface, sill, materials);
  const corner = createCorner(surface, materials);
  root.add(corner.root);
  textures.push(...corner.textures);
  root.add(paper.root);
  textures.push(...paper.textures);

  return {
    root,
    textures,
    phone,
    phoneScreen,
    update(seconds: number, night: number) {
      paper.update(seconds, 1);
      corner.update(seconds);
      for (let i = 0; i < motes.length; i++) {
        const [x, y, z, phase] = motes[i]!;
        motePositions[i * 3] = x! + Math.sin(seconds * 0.13 + phase!) * 0.14;
        motePositions[i * 3 + 1] = y! + Math.sin(seconds * 0.09 + phase! * 1.3) * 0.2;
        motePositions[i * 3 + 2] = z! + Math.cos(seconds * 0.11 + phase!) * 0.1;
      }
      moteGeometry.attributes.position!.needsUpdate = true;
      moteMaterial.opacity = (1 - night) * 0.6;
      const now = new Date();
      const minutes = now.getMinutes() + now.getSeconds() / 60;
      minuteHand.rotation.y = -(minutes / 60) * Math.PI * 2;
      hourHand.rotation.y = -(((now.getHours() % 12) + minutes / 60) / 12) * Math.PI * 2;
      cornerLight.intensity = night * 0.7;
      shadeMaterial.emissive.setHex(0x6a3a10).multiplyScalar(0.3 + night * 1.2);
      for (let i = 0; i < bulbs.length; i++) {
        const twinkle = 0.75 + Math.sin(seconds * 1.3 + i * 2.4) * 0.25;
        bulbs[i]!.color.setHex(bulbColors[i % bulbColors.length]!).multiplyScalar(
          0.35 + night * 0.65 * twinkle,
        );
      }
      flame.scale.set(1, 1.8 + Math.sin(seconds * 9) * 0.25, 1);
      fireflyMaterial.color.setHex(0xffe08a).multiplyScalar(0.4 + night * 2.2);
      jarLight.intensity = night * 0.35;
      for (let i = 0; i < fireflies.length; i++)
        fireflies[i]!.scale.setScalar(0.6 + 0.5 * Math.sin(seconds * (1.3 + i * 0.2) + i));
    },
  };
}
