import {
  Color,
  DepthTexture,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLUR = `
uniform sampler2D source;
uniform vec2 step;
uniform float threshold;
varying vec2 vUv;
vec3 tap(vec2 uv) {
  vec3 color = texture2D(source, uv).rgb;
  return max(color - threshold, 0.0);
}
void main() {
  vec3 sum = tap(vUv) * 0.227;
  sum += (tap(vUv + step * 1.385) + tap(vUv - step * 1.385)) * 0.316;
  sum += (tap(vUv + step * 3.231) + tap(vUv - step * 3.231)) * 0.07;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE = `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float bloom;
uniform float outline;
uniform float halftone;
uniform float vignette;
uniform vec3 gain;
uniform vec3 shadow;
uniform vec3 haze;
uniform float hazeAmount;
varying vec2 vUv;
float grainHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float grainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grainHash(i), grainHash(i + vec2(1, 0)), f.x), mix(grainHash(i + vec2(0, 1)), grainHash(i + vec2(1, 1)), f.x), f.y);
}
float depthAt(vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
}
void main() {
  vec3 color = texture2D(tColor, vUv).rgb;
  float z = depthAt(vUv);
  float edge = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 offset = (1.0 + grainNoise(gl_FragCoord.xy / 14.0) * 0.8) * texel * vec2(i == 0 ? 1.0 : i == 1 ? -1.0 : 0.0, i == 2 ? 1.0 : i == 3 ? -1.0 : 0.0);
    float other = depthAt(vUv + offset);
    edge = max(edge, (other - z) / z);
  }
  edge = smoothstep(0.035, 0.09, edge) * (1.0 - smoothstep(3.2, 5.0, z));
  color = mix(color, color * vec3(0.22, 0.16, 0.2), edge * outline);
  color += texture2D(tBloom, vUv).rgb * bloom;
  float light = dot(color, vec3(0.299, 0.587, 0.114));
  vec2 cell = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / 4.0;
  float radius = sqrt(clamp(1.0 - light * 6.0, 0.0, 1.0)) * 0.42;
  float dots = 1.0 - smoothstep(radius - 0.08, radius + 0.08, length(fract(cell) - 0.5));
  color *= 1.0 - dots * halftone;
  color = color * gain + shadow * (1.0 - smoothstep(0.0, 0.5, light));
  color = mix(color, haze, hazeAmount * (1.0 - vUv.y * 0.5) * 0.5);
  float paper = grainNoise(gl_FragCoord.xy / 90.0) * 0.5 + grainNoise(gl_FragCoord.xy / 9.0) * 0.3 + grainNoise(gl_FragCoord.xy / 2.5) * 0.2;
  color *= 0.95 + paper * 0.09;
  vec2 centered = vUv - 0.5;
  color *= 1.0 - vignette * pow(length(centered * vec2(1.1, 1.3)), 2.4);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type Grade = {
  daylight: number;
  twilight: number;
  wet: number;
};

export function createPost(renderer: WebGLRenderer) {
  const target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    samples: 4,
    depthTexture: new DepthTexture(1, 1),
  });
  const bloomA = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const bloomB = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const blur = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: BLUR,
    uniforms: {
      source: { value: null as Texture | null },
      step: { value: new Vector2() },
      threshold: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const composite = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: COMPOSITE,
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: target.depthTexture },
      tBloom: { value: bloomB.texture },
      texel: { value: new Vector2() },
      near: { value: 0.05 },
      far: { value: 100 },
      bloom: { value: 0.7 },
      outline: { value: 0.85 },
      halftone: { value: 0.16 },
      vignette: { value: 0.35 },
      gain: { value: new Color(1, 1, 1) },
      shadow: { value: new Color(0, 0, 0) },
      haze: { value: new Color(0, 0, 0) },
      hazeAmount: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), composite);
  quad.frustumCulled = false;
  const screen = new Scene();
  screen.add(quad);
  const view = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new Vector2();
  const pass = (material: ShaderMaterial, output: WebGLRenderTarget | null) => {
    quad.material = material;
    renderer.setRenderTarget(output);
    renderer.render(screen, view);
  };
  const uniforms = composite.uniforms;
  const warm = new Color();
  return {
    setSize(width: number, height: number) {
      const ratio = renderer.getPixelRatio();
      size.set(Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)));
      target.setSize(size.x, size.y);
      bloomA.setSize(Math.ceil(size.x / 4), Math.ceil(size.y / 4));
      bloomB.setSize(Math.ceil(size.x / 4), Math.ceil(size.y / 4));
      uniforms.texel!.value.set(ratio / size.x, ratio / size.y);
    },
    grade({ daylight, twilight, wet }: Grade) {
      const night = Math.max(0, 1 - daylight - twilight);
      uniforms
        .gain!.value.setRGB(1, 1, 1)
        .lerp(warm.setRGB(1.08, 0.93, 0.84), twilight)
        .lerp(warm.setRGB(0.86, 0.97, 1.08), night);
      uniforms
        .shadow!.value.setRGB(0.0, 0.0, 0.0)
        .lerp(warm.setRGB(0.05, 0.012, 0.02), twilight)
        .lerp(warm.setRGB(0.0, 0.025, 0.035), night);
      uniforms
        .haze!.value.setRGB(0.9, 0.85, 0.8)
        .lerp(warm.setRGB(1.0, 0.45, 0.3), twilight)
        .lerp(warm.setRGB(0.1, 0.16, 0.24), night)
        .lerp(warm.setRGB(0.45, 0.5, 0.55), wet * 0.5);
      uniforms.hazeAmount!.value = 0.06 + twilight * 0.14 + wet * 0.06;
      uniforms.bloom!.value = 0.28 + night * 0.14;
    },
    compile(scene: Scene, camera: PerspectiveCamera) {
      renderer.setRenderTarget(target);
      const ready = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(null);
      return ready;
    },
    render(scene: Scene, camera: PerspectiveCamera) {
      uniforms.near!.value = camera.near;
      uniforms.far!.value = camera.far;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const calls = renderer.info.render.calls;
      blur.uniforms.source!.value = target.texture;
      blur.uniforms.threshold!.value = 3.2;
      blur.uniforms.step!.value.set(4 / size.x, 0);
      pass(blur, bloomA);
      blur.uniforms.source!.value = bloomA.texture;
      blur.uniforms.threshold!.value = 0;
      blur.uniforms.step!.value.set(0, 4 / size.y);
      pass(blur, bloomB);
      pass(composite, null);
      return calls;
    },
    dispose() {
      target.depthTexture?.dispose();
      target.dispose();
      bloomA.dispose();
      bloomB.dispose();
      blur.dispose();
      composite.dispose();
      quad.geometry.dispose();
    },
  };
}
