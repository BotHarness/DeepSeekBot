import { Mesh, type Color, type Material, type Object3D } from 'three';
import { MToonMaterial } from '@pixiv/three-vrm';
import { LilToonMaterial } from '@mochiya/three-liltoon';

export type CharacterShading = 'mtoon' | 'liltoon';

export function createCharacterShading(root: Object3D) {
  const meshes: { mesh: Mesh; material: Material | Material[] }[] = [];
  const replacements = new Map<MToonMaterial, LilToonMaterial>();
  const outlines = new Map<MToonMaterial, boolean>();
  const surfaces = new Set<MToonMaterial>();
  let active: CharacterShading = 'mtoon';
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes.push({ mesh: object, material: object.material });
    for (const source of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(source instanceof MToonMaterial)) continue;
      if (source.isOutline) {
        outlines.set(source, source.visible);
        continue;
      }
      if (replacements.has(source)) continue;
      surfaces.add(source);
      source.color.multiplyScalar(0.9);
      source.parametricRimFresnelPowerFactor = 3.5;
      source.parametricRimLiftFactor = 0;
      const converted = new LilToonMaterial({
        name: source.name + ' · lilToon',
        color: source.color,
        opacity: source.opacity,
        map: source.map,
        alphaTest: source.alphaTest,
        deformation: true,
        shaderVariant: source.transparent
          ? 'Hidden/lilToonTransparent'
          : source.alphaTest > 0
            ? 'Hidden/lilToonCutoutOutline'
            : 'Hidden/lilToonOutline',
        properties: {
          _UseShadow: 1,
          _ShadowColor: [0.68, 0.49, 0.47, 1],
          _ShadowBorder: 0.48,
          _ShadowBlur: 0.25,
          _Shadow2ndColor: [0.43, 0.43, 0.57, 0.2],
          _Shadow2ndBorder: 0.12,
          _Shadow2ndBlur: 0.35,
          _ShadowEnvStrength: 0.45,
          _LightMinLimit: 0.12,
          _LightMaxLimit: 1.35,
          _AsUnlit: 0,
          _UseRim: 1,
          _RimColor: [0.3, 0.16, 0.08, 1],
          _RimBorder: 0.75,
          _RimBlur: 0.4,
          _RimEnableLighting: 1,
          _OutlineWidth: 0.035,
          _OutlineColor: [0.055, 0.035, 0.04, 1],
          _OutlineEnableLighting: 1,
          _Cull: source.side === 2 ? 0 : source.side === 1 ? 1 : 2,
          _UseBumpMap: source.normalMap ? 1 : 0,
          _BumpScale: source.normalScale.x,
          _UseEmission: source.emissiveMap || source.emissive.getHex() ? 1 : 0,
        },
        textures: { _BumpMap: source.normalMap, _EmissionMap: source.emissiveMap },
      });
      converted.depthWrite = source.depthWrite;
      replacements.set(source, converted);
    }
  });
  const select = (mode: CharacterShading) => {
    active = mode;
    for (const [outline, visible] of outlines) outline.visible = mode === 'mtoon' && visible;
    const replace = (source: Material) =>
      mode === 'liltoon' && source instanceof MToonMaterial
        ? (replacements.get(source) ?? source)
        : source;
    for (const { mesh, material } of meshes)
      mesh.material =
        mode === 'mtoon'
          ? material
          : Array.isArray(material)
            ? material.map(replace)
            : replace(material);
  };
  return {
    select,
    rim(color: Color) {
      for (const surface of surfaces) surface.parametricRimColorFactor.copy(color);
    },
    update() {
      if (active !== 'liltoon') return;
      for (const [source, target] of replacements) {
        target.color.copy(source.color);
        target.opacity = source.opacity;
        target.setProperty(
          '_EmissionColor',
          source.emissive.clone().multiplyScalar(source.emissiveIntensity),
        );
        const map = source.map;
        if (map)
          target.setProperty('_MainTex_ST', [
            map.repeat.x,
            map.repeat.y,
            map.offset.x,
            map.offset.y,
          ]);
      }
    },
    dispose() {
      select('mtoon');
      for (const material of replacements.values()) material.dispose();
      replacements.clear();
      outlines.clear();
      surfaces.clear();
      meshes.length = 0;
    },
  };
}
