import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferAttribute,
} from 'three';
import type { createRoomMaterials } from './materials.js';

type Materials = ReturnType<typeof createRoomMaterials>;
const PAGE_WIDTH = 0.15;
const PAGE_DEPTH = 0.21;
const FLIP_EVERY = 16;
const FLIP_LENGTH = 1.6;

const writing = (ruled: boolean) => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 176;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#f6efe0';
  g.fillRect(0, 0, 128, 176);
  if (ruled) {
    g.fillStyle = '#c9d7e3';
    for (let y = 22; y < 176; y += 12) g.fillRect(0, y, 128, 1);
    g.fillStyle = '#e5a7a0';
    g.fillRect(18, 0, 1, 176);
  }
  for (let i = 0; i < 11; i++) {
    const width = 40 + ((i * 37) % 60);
    g.fillStyle = i === 0 ? '#5b4a6e' : '#7d8794';
    g.fillRect(24, 17 + i * 12 + (i === 0 ? 0 : 2), i === 0 ? 50 : width, i === 0 ? 4 : 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const curve = (distance: number) =>
  0.016 * Math.sin(Math.min(1, distance / (PAGE_WIDTH * 0.45)) * (Math.PI / 2));

export function createPaper(surface: number, sill: number, materials: Materials) {
  const root = new Group();
  const pageTexture = writing(false);
  const noteTexture = writing(true);
  const page = materials.toon(0xffffff, { map: pageTexture, side: DoubleSide });
  const note = materials.toon(0xffffff, { map: noteTexture, side: DoubleSide });
  const sheets: Array<{
    geometry: PlaneGeometry;
    rest: Float32Array;
    phase: number;
    gust: number;
  }> = [];
  const sheet = (x: number, y: number, z: number, yaw: number, gust: number) => {
    const geometry = new PlaneGeometry(0.15, PAGE_DEPTH, 3, 6);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -PAGE_DEPTH / 2);
    const mesh = new Mesh(geometry, note);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.receiveShadow = true;
    root.add(mesh);
    sheets.push({
      geometry,
      rest: (geometry.attributes.position as BufferAttribute).array.slice() as Float32Array,
      phase: sheets.length * 2.1,
      gust,
    });
  };
  sheet(1.15, surface + 0.002, 0.22, 2.6, 0.5);
  sheet(1.2, surface + 0.004, 0.2, 2.2, 0.8);
  sheet(0.3, sill + 0.003, -0.84, 0.1, 1);
  sheet(-0.22, surface + 0.002, 0.42, 0.5, 0.2);
  sheet(-0.02, surface + 0.003, 0.72, 1.1, 0.25);

  const book = new Group();
  book.position.set(0.16, surface, 0.5);
  book.rotation.y = 2.9;
  root.add(book);
  const cover = new Mesh(
    new BoxGeometry(PAGE_WIDTH * 2 + 0.02, 0.008, PAGE_DEPTH + 0.02),
    materials.toon(0x6e4a5c),
  );
  cover.position.y = 0.004;
  cover.castShadow = cover.receiveShadow = true;
  book.add(cover);
  const surfaceGeometry = (side: number) => {
    const geometry = new PlaneGeometry(PAGE_WIDTH, PAGE_DEPTH, 6, 1);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const distance = position.getX(i) + PAGE_WIDTH / 2;
      position.setXYZ(i, side * distance, 0.012 + curve(distance), position.getZ(i));
    }
    geometry.computeVertexNormals();
    return geometry;
  };
  for (const side of [-1, 1]) {
    const stack = new Mesh(
      new BoxGeometry(PAGE_WIDTH - 0.01, 0.01, PAGE_DEPTH - 0.004),
      materials.cream,
    );
    stack.position.set(side * (PAGE_WIDTH / 2 + 0.002), 0.013, 0);
    book.add(stack);
    const leaf = new Mesh(surfaceGeometry(side), page);
    leaf.receiveShadow = true;
    book.add(leaf);
  }
  const flipping = surfaceGeometry(1);
  const flipRest = (flipping.attributes.position as BufferAttribute).array.slice() as Float32Array;
  const flip = new Mesh(flipping, page);
  flip.position.y = 0.0005;
  book.add(flip);

  return {
    root,
    textures: [pageTexture, noteTexture],
    update(seconds: number, wind: number) {
      for (const { geometry, rest, phase, gust } of sheets) {
        const position = geometry.attributes.position as BufferAttribute;
        const strength =
          gust * wind * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(seconds * 0.45 + phase), 3));
        for (let i = 0; i < position.count; i++) {
          const along = -rest[i * 3 + 2]! / PAGE_DEPTH;
          const across = rest[i * 3]!;
          const lift =
            strength *
            along *
            along *
            (0.55 + 0.45 * Math.sin(seconds * 3.1 + phase + across * 18 + along * 2));
          position.setXYZ(
            i,
            across,
            rest[i * 3 + 1]! + lift * 0.05,
            rest[i * 3 + 2]! + lift * 0.012,
          );
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
      }
      const cycle = (seconds + 5) % FLIP_EVERY;
      const progress = Math.min(1, cycle / FLIP_LENGTH);
      const eased = progress * progress * (3 - 2 * progress);
      const position = flipping.attributes.position as BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const distance = flipRest[i * 3]!;
        const angle =
          eased * Math.PI - Math.sin(progress * Math.PI) * 0.7 * (distance / PAGE_WIDTH);
        const lift = curve(distance) * (1 - Math.sin(progress * Math.PI));
        position.setXYZ(
          i,
          Math.cos(angle) * distance,
          0.012 + Math.sin(angle) * distance + lift,
          flipRest[i * 3 + 2]!,
        );
      }
      position.needsUpdate = true;
      flipping.computeVertexNormals();
    },
  };
}
