import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Object3D,
  type Scene,
} from 'three';
import { VRMUtils, type VRM } from '@pixiv/three-vrm';

export function mountCharacter(loaded: VRM, actor: Group) {
  VRMUtils.rotateVRM0(loaded);
  actor.add(loaded.scene);
  loaded.scene.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = object.receiveShadow = true;
  });
  const box = new Box3().setFromObject(loaded.scene);
  const size = box.getSize(new Vector3());
  return { box, size };
}

export function attachHeadphones(
  rawHead: Object3D,
  actor: Group,
  scene: Scene,
  modelScale: number,
) {
  const headphones = new Group();
  const shell = new MeshStandardMaterial({ color: 0x8d3e4c, roughness: 0.7 });
  const cushion = new MeshStandardMaterial({ color: 0x27333e, roughness: 1 });
  const band = new Mesh(new TorusGeometry(0.122, 0.018, 8, 32, Math.PI), shell);
  band.position.y = 0.075;
  headphones.add(band);
  for (const side of [-1, 1]) {
    const cup = new Mesh(new SphereGeometry(0.052, 16, 12), shell);
    cup.scale.set(0.55, 1, 0.85);
    cup.position.set(side * 0.122, 0.065, 0);
    headphones.add(cup);
    const pad = new Mesh(new SphereGeometry(0.05, 16, 12), cushion);
    pad.scale.set(0.4, 1, 0.8);
    pad.position.set(side * 0.105, 0.065, 0);
    headphones.add(pad);
  }
  actor.updateMatrixWorld(true);
  headphones.position.copy(rawHead.getWorldPosition(new Vector3()));
  headphones.quaternion.copy(actor.getWorldQuaternion(new Quaternion()));
  headphones.scale.setScalar(modelScale);
  scene.add(headphones);
  rawHead.attach(headphones);
  return headphones;
}

export function releaseCharacter(value: VRM): void {
  value.scene.traverse((object) => {
    const mesh = object as import('three').Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials)
      if (material)
        for (const entry of Object.values(material)) {
          const image = (entry as { isTexture?: boolean; source?: { data?: unknown } } | null)
            ?.isTexture
            ? (entry as import('three').Texture).source.data
            : undefined;
          if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
        }
  });
  VRMUtils.deepDispose(value.scene);
}
