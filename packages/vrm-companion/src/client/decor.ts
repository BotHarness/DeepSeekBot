import { Box3, Group, Mesh, MeshStandardMaterial, MeshToonMaterial, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMUtils } from '@pixiv/three-vrm';

export function createDecor(
  tableY: number,
  toon: (color: number, extra: { map: Texture | null }) => MeshToonMaterial,
) {
  const root = new Group();
  let disposed = false;
  let loaded = 0;
  let failed = 0;
  const release = (model: Group) => {
    const images = new Set<ImageBitmap>();
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) {
          if (
            value instanceof Texture &&
            typeof ImageBitmap !== 'undefined' &&
            value.image instanceof ImageBitmap
          )
            images.add(value.image);
        }
      }
    });
    VRMUtils.deepDispose(model);
    for (const image of images) image.close();
  };
  const placements = [
    { name: 'book_set', scale: 0.36, x: -0.62, y: tableY + 0.045, z: 0.3, yaw: Math.PI },
    { name: 'shelf_B_small_decorated', scale: 0.65, x: 1.69, y: 0, z: -0.72, yaw: 0 },
    { name: 'cactus_small_A', scale: 0.32, x: 0.42, y: 0.645, z: -0.95, yaw: 0.6 },
    { name: 'cactus_medium_A', scale: 0.42, x: 1.55, y: 0.645, z: -0.95, yaw: -0.4 },
    { name: 'pictureframe_small_A', scale: 0.42, x: 1.22, y: 0.645, z: -0.99, yaw: 0.3 },
    { name: 'pillow_A', scale: 0.75, x: -0.2, y: 0.645, z: -0.96, yaw: 0.25 },
    { name: 'book_single', scale: 0.5, x: 0.72, y: 0.645, z: -0.98, yaw: Math.PI / 2 },
  ];
  for (const placement of placements) {
    const source = __ROOM_ASSETS__[placement.name];
    if (!source) {
      failed++;
      continue;
    }
    void new GLTFLoader()
      .loadAsync(source)
      .then(({ scene: model }) => {
        if (disposed) {
          release(model);
          return;
        }
        model.scale.setScalar(placement.scale);
        model.rotation.y = placement.yaw;
        const bounds = new Box3().setFromObject(model);
        model.position.set(placement.x, placement.y - bounds.min.y, placement.z);
        model.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          object.castShadow = object.receiveShadow = true;
          const convert = (material: import('three').Material) => {
            if (!(material instanceof MeshStandardMaterial)) return material;
            const converted = toon(material.color.getHex(), { map: material.map });
            material.dispose();
            return converted;
          };
          object.material = Array.isArray(object.material)
            ? object.material.map(convert)
            : convert(object.material);
        });
        root.add(model);
        loaded++;
      })
      .catch(() => {
        if (!disposed) failed++;
      });
  }
  return {
    root,
    state: () => `${loaded}/${placements.length}${failed ? ` failed:${failed}` : ''}`,
    dispose() {
      disposed = true;
      for (const child of root.children) release(child as Group);
      root.clear();
    },
  };
}
