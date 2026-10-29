import {
  DataTexture,
  type WebGLProgramParametersWithUniforms,
  DoubleSide,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type ColorRepresentation,
  type MeshToonMaterialParameters,
  type Texture,
} from 'three';

const PAINT = `
varying vec3 vPaint;
float paintHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float paintNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(paintHash(i), paintHash(i + vec3(1, 0, 0)), f.x), mix(paintHash(i + vec3(0, 1, 0)), paintHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(paintHash(i + vec3(0, 0, 1)), paintHash(i + vec3(1, 0, 1)), f.x), mix(paintHash(i + vec3(0, 1, 1)), paintHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
`;

const paint = (shader: WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vPaint;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvPaint = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${PAINT}`)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float brush = paintNoise(vPaint * vec3(7.0, 2.5, 7.0)) * 0.55 + paintNoise(vPaint * 26.0) * 0.3 + paintNoise(vPaint * 90.0) * 0.15;
      diffuseColor.rgb *= 0.9 + brush * 0.2;`,
    );
};

export function createRoomMaterials() {
  const gradient = new DataTexture(new Uint8Array([60, 128, 196, 255]), 4, 1, RedFormat);
  gradient.minFilter = gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  const toon = (color: ColorRepresentation, extra: MeshToonMaterialParameters = {}) => {
    const material = new MeshToonMaterial({ color, gradientMap: gradient, ...extra });
    material.onBeforeCompile = paint;
    material.customProgramCacheKey = () => 'paint';
    return material;
  };
  const textures: Texture[] = [gradient];
  return {
    textures,
    toon,
    wood: toon(0x9a7658),
    dark: toon(0x2c3a40),
    fabric: toon(0x34444c),
    red: toon(0xb0463f),
    cream: toon(0xeee0c6),
    brass: toon(0xc79d5f),
    plaster: toon(0xc9a78c),
    linen: toon(0xeadbc0, { side: DoubleSide }),
  };
}
