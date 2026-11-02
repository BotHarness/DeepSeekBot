import {
  BackSide,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  LineSegments,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { solarDay } from './sun.js';

export type SkyTime = 'auto' | 'sunset' | 'night';
export type Weather = 'clear' | 'rain';
export function createOutdoors() {
  const root = new Group();
  const sky = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { zenith: { value: new Color() }, horizon: { value: new Color() } },
    vertexShader: `varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 direction; uniform vec3 zenith; uniform vec3 horizon;
      void main(){
        float t=smoothstep(-0.05,0.25,normalize(direction).y);
        gl_FragColor=vec4(mix(horizon,zenith,t),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new SphereGeometry(60, 32, 24), sky);
  root.add(dome);
  const glow = (core: number, halo: number, rings = 0) =>
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { tint: { value: new Color() }, opacity: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform vec3 tint; uniform float opacity;
        void main(){
          float d=length(vUv*2.0-1.0);
          float disk=1.0-smoothstep(${core.toFixed(3)}-0.02,${core.toFixed(3)},d);
          float haze=pow(max(0.0,1.0-d),${halo.toFixed(1)})*0.55;
          haze+=pow(max(0.0,1.0-d),1.2)*smoothstep(0.55,1.0,0.5+0.5*cos(d*30.0))*${rings.toFixed(2)};
          gl_FragColor=vec4(tint*(1.0+disk*2.2),clamp(disk+haze,0.0,1.0)*opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  const sunMaterial = glow(0.12, 2.2, 0.22);
  const sun = new Mesh(new PlaneGeometry(13, 13), sunMaterial);
  root.add(sun);
  const moonMaterial = glow(0.2, 3);
  moonMaterial.uniforms.tint!.value.set(0xdbe7ff);
  const moon = new Mesh(new PlaneGeometry(5, 5), moonMaterial);
  root.add(moon);
  const cloudMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      light: { value: new Color() },
      shade: { value: new Color() },
      rim: { value: new Color() },
      sunDir: { value: new Vector2(0, 1) },
      cover: { value: 0 },
    },
    vertexShader: `attribute float seed; varying vec2 vUv; varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = seed;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 light; uniform vec3 shade; uniform vec3 rim; uniform vec2 sunDir; uniform float cover;
      varying vec2 vUv; varying float vSeed;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      float lobes(vec2 p) {
        float body = 0.0;
        for (int i = 0; i < 9; i++) {
          float k = float(i);
          float row = k < 5.0 ? 0.0 : 1.0;
          float slot = k < 5.0 ? k : k - 5.0;
          vec2 center = row == 0.0
            ? vec2(-0.56 + 0.28 * slot, -0.22 + 0.08 * sin(vSeed * 7.0 + k * 1.9))
            : vec2(-0.36 + 0.24 * slot, 0.06 + 0.14 * fract(sin(vSeed * 5.0 + k) * 41.3));
          float r = (row == 0.0 ? 0.28 : 0.24) + 0.1 * fract(sin(vSeed * 13.0 + k) * 91.7);
          r *= 1.0 - row * step(0.6, fract(sin(vSeed * 3.0 + k) * 17.1)) * 0.6;
          vec2 d = (p - center) / vec2(r * 1.25, r);
          body += exp(-dot(d, d) * 1.6);
        }
        return body;
      }
      float density(vec2 p) {
        vec2 warp = vec2(fbm(p * 2.2 + vSeed * 3.0), fbm(p * 2.2 - vSeed * 5.0)) - 0.5;
        vec2 q = p + warp * 0.22;
        float body = lobes(q) * 0.9;
        body = max(body, cover * 0.35 * smoothstep(1.0, 0.2, length(p)));
        float n = fbm(q * 4.3 + vSeed * 17.0);
        vec2 edge = smoothstep(vec2(1.0), vec2(0.6), abs(p));
        return (body * (0.75 + n * 0.5) - 0.18) * edge.x * edge.y * smoothstep(-0.62, -0.25, p.y);
      }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = density(p);
        float alpha = smoothstep(0.0, 0.32, d);
        if (alpha < 0.004) discard;
        vec2 toward = normalize(sunDir);
        float lit = clamp((d - density(p + toward * 0.1)) * 3.0 + 0.5, 0.0, 1.0);
        float thick = smoothstep(0.1, 0.9, d);
        vec3 color = mix(light, shade, smoothstep(0.3, 1.0, 1.0 - lit) * (0.25 + thick * 0.35));
        color = mix(color, rim, (1.0 - smoothstep(0.0, 0.22, d)) * smoothstep(0.5, 0.8, lit) * 0.7);
        color = mix(color, shade * 0.9, smoothstep(-0.1, -0.5, p.y) * 0.45);
        gl_FragColor = vec4(color, alpha * 0.96);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const clouds: {
    mesh: InstancedMesh;
    index: number;
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    speed: number;
  }[] = [];
  const layers: InstancedMesh[] = [];
  const perLayer = 7;
  for (let layer = 2; layer >= 0; layer--) {
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), cloudMaterial, perLayer);
    const seeds = new Float32Array(perLayer);
    for (let i = 0; i < perLayer; i++) {
      seeds[i] = layer * 3.17 + i * 1.31;
      clouds.push({
        mesh,
        index: i,
        x: (i - 3) * 7 + layer * 2.3,
        y: -0.6 + layer * 0.9 + Math.sin(i * 2.3 + layer) * 0.7,
        z: -10 - layer * 8,
        w: 8 + (i % 3) * 2 + layer * 2.4,
        h: 4.6 + (i % 2) * 1 + layer * 1.2,
        speed: 0.03 + (2 - layer) * 0.02,
      });
    }
    mesh.geometry.setAttribute('seed', new InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    mesh.renderOrder = -layer;
    root.add(mesh);
    layers.push(mesh);
  }
  const placement = new Matrix4();
  const balloons: { group: Group; y: number; phase: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const group = new Group();
    group.position.set(-6 + i * 5, 6 + i * 1.8, -18 - i * 3);
    const envelope = new Mesh(
      new SphereGeometry(0.65, 20, 16),
      new MeshStandardMaterial({ color: [0xbd6e71, 0xcdb48b, 0x7c9da2][i]!, roughness: 1 }),
    );
    envelope.scale.y = 1.3;
    group.add(envelope);
    const basket = new Mesh(
      new CylinderGeometry(0.17, 0.14, 0.22, 8),
      new MeshStandardMaterial({ color: 0x936543 }),
    );
    basket.position.y = -1.1;
    group.add(basket);
    const ropeMaterial = new MeshStandardMaterial({ color: 0xd2b58b });
    for (const side of [-1, 1]) {
      const rope = new Mesh(new CylinderGeometry(0.012, 0.012, 0.5, 5), ropeMaterial);
      rope.position.set(side * 0.15, -0.85, 0);
      group.add(rope);
    }
    root.add(group);
    balloons.push({ group, y: group.position.y, phase: i * 2 });
  }
  const planet = new Mesh(
    new SphereGeometry(5, 32, 24),
    new MeshBasicMaterial({ color: 0xd79d8f, transparent: true, opacity: 0.2 }),
  );
  planet.position.set(8, 16, -40);
  root.add(planet);
  const ring = new Mesh(
    new TorusGeometry(7.2, 0.08, 6, 64),
    new MeshBasicMaterial({ color: 0xf1b89d, transparent: true, opacity: 0.3 }),
  );
  ring.position.copy(planet.position);
  ring.rotation.set(0.8, 0.2, -0.3);
  root.add(ring);
  const starGeometry = new BufferGeometry();
  const stars = [];
  for (let i = 0; i < 160; i++) {
    stars.push(Math.sin(i * 127.1) * 35, 2 + (Math.sin(i * 311.7) + 1) * 14, -30 - (i % 9));
  }
  starGeometry.setAttribute('position', new Float32BufferAttribute(stars, 3));
  const starMaterial = new PointsMaterial({ color: 0xe6ecff, size: 0.055, transparent: true });
  root.add(new Points(starGeometry, starMaterial));
  const drops = 1400;
  const streaks = new Float32Array(drops * 6);
  const ends = new Float32Array(drops * 2);
  for (let i = 0; i < drops; i++) {
    const x = Math.sin(i * 91.3) * 4.5;
    const y = (Math.sin(i * 47.9) * 0.5 + 0.5) * 6;
    const z = -1.5 - (Math.sin(i * 13.7) * 0.5 + 0.5) * 7;
    streaks.set([x, y, z, x, y, z], i * 6);
    ends.set([0, 1], i * 2);
  }
  const rainGeometry = new BufferGeometry();
  rainGeometry.setAttribute('position', new Float32BufferAttribute(streaks, 3));
  rainGeometry.setAttribute('end', new Float32BufferAttribute(ends, 1));
  const rainMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, amount: { value: 0 }, tint: { value: new Color() } },
    vertexShader: `attribute float end; uniform float time; varying float vEnd;
      void main() {
        vec3 p = position;
        float speed = 7.0 + fract(p.x * 7.13) * 3.0;
        p.y = mod(p.y - time * speed, 6.0) - 0.8;
        p += vec3(0.05, 0.32, 0.0) * end;
        vEnd = end;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float amount; uniform vec3 tint; varying float vEnd;
      void main() {
        gl_FragColor = vec4(tint, amount * mix(0.55, 0.0, vEnd));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const rain = new LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  root.add(rain);
  const birdMaterial = new MeshBasicMaterial({ color: 0x3a2a35, transparent: true });
  const wingGeometry = new PlaneGeometry(0.42, 0.06).translate(0.21, 0, 0);
  const birds = Array.from({ length: 5 }, (_, i) => {
    const group = new Group();
    const left = new Mesh(wingGeometry, birdMaterial);
    const right = new Mesh(wingGeometry, birdMaterial);
    right.scale.x = -1;
    group.add(left, right);
    root.add(group);
    return { group, left, right, phase: i * 1.37, lead: (i % 3) * 0.9 + Math.floor(i / 3) * 0.5 };
  });
  let wet = 0;
  let solarKey = '';
  let solar = solarDay(new Date());
  let seconds = 0;
  const update = (dt: number, mode: SkyTime, weather: Weather = 'clear') => {
    seconds += dt;
    const target = weather === 'rain' ? 1 : 0;
    wet = dt === 0 ? target : wet + (target - wet) * Math.min(1, dt * 0.8);
    const now = new Date();
    const today = now.toDateString();
    if (today !== solarKey) {
      solarKey = today;
      solar = solarDay(now);
    }
    const { sunrise, sunset } = solar;
    const hour =
      mode === 'sunset'
        ? sunset
        : mode === 'night'
          ? 23
          : now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const arc = (hour - sunrise) / (sunset - sunrise);
    const daylight = Math.max(0, Math.sin(arc * Math.PI));
    const twilight = Math.max(
      0,
      1 - Math.abs(hour - sunset) / 1.2,
      1 - Math.abs(hour - sunrise) / 1.2,
    );
    sky.uniforms
      .zenith!.value.set(0x111c38)
      .lerp(new Color(0x6d9fc3), daylight)
      .lerp(new Color(0xc8473a), twilight);
    sky.uniforms
      .horizon!.value.set(0x58678e)
      .lerp(new Color(0xdbe5d3), daylight)
      .lerp(new Color(0xff8d4e), twilight);
    const overcast = new Color(0x2a3140)
      .lerp(new Color(0x7d8794), daylight)
      .lerp(new Color(0x8a6f6a), twilight);
    sky.uniforms.zenith!.value.lerp(overcast, wet * 0.8);
    sky.uniforms.horizon!.value.lerp(overcast.clone().multiplyScalar(1.25), wet * 0.75);
    const angle = arc * Math.PI;
    sun.position.set(12 * Math.cos(angle), 6 + 14 * Math.sin(angle), -24);
    sun.visible = hour >= sunrise - 1 && hour <= sunset + 1.5;
    moon.position.set(-8, 13, -28);
    moon.visible = daylight < 0.12;
    sunMaterial.uniforms
      .tint!.value.set(0xfff4d6)
      .lerp(new Color(0xffc27d), Math.min(1, twilight * 1.3));
    sunMaterial.uniforms.opacity!.value = Math.min(
      1,
      Math.max(0, Math.min((hour - sunrise + 1) * 2, (sunset + 1.5 - hour) * 2)),
    );
    cloudMaterial.uniforms
      .light!.value.set(0x5d6f99)
      .lerp(new Color(0xffffff), daylight)
      .lerp(new Color(0xffd77a), twilight);
    cloudMaterial.uniforms
      .shade!.value.set(0x252f4d)
      .lerp(new Color(0xb8c6da), daylight)
      .lerp(new Color(0xd8704e), twilight);
    cloudMaterial.uniforms
      .rim!.value.set(0x8f9fc8)
      .lerp(new Color(0xffffff), daylight)
      .lerp(new Color(0xffe2b0), twilight);
    starMaterial.opacity = Math.max(0, 1 - daylight * 8 - twilight) * (1 - wet);
    const grey = new Color(0x3a4150).lerp(new Color(0x9aa3ad), daylight);
    cloudMaterial.uniforms.light!.value.lerp(grey, wet * 0.75);
    cloudMaterial.uniforms.shade!.value.lerp(grey.clone().multiplyScalar(0.6), wet * 0.75);
    cloudMaterial.uniforms.rim!.value.lerp(grey, wet * 0.75);
    cloudMaterial.uniforms.cover!.value = wet;
    sunMaterial.uniforms.opacity!.value *= 1 - wet * 0.9;
    moonMaterial.uniforms.opacity!.value = 1 - wet * 0.9;
    rainMaterial.uniforms.time!.value = seconds;
    rainMaterial.uniforms.amount!.value = wet;
    rainMaterial.uniforms.tint!.value.set(0x9fb2cc).lerp(new Color(0xd8e2ee), daylight);
    rain.visible = wet > 0.01;
    const light = daylight > 0.05 || twilight > 0.05 ? sun.position : moon.position;
    cloudMaterial.uniforms.sunDir!.value.set(light.x * 0.08, light.y - 2).normalize();
    for (const cloud of clouds) {
      const x = ((((cloud.x + seconds * cloud.speed + 26) % 52) + 52) % 52) - 26;
      placement.makeScale(cloud.w, cloud.h, 1).setPosition(x, cloud.y, cloud.z);
      cloud.mesh.setMatrixAt(cloud.index, placement);
    }
    for (const layer of layers) layer.instanceMatrix.needsUpdate = true;
    sun.lookAt(0, 1, 0);
    moon.lookAt(0, 1, 0);
    for (const balloon of balloons) {
      balloon.group.position.y = balloon.y + Math.sin(seconds * 0.12 + balloon.phase) * 0.25;
      balloon.group.rotation.z = Math.sin(seconds * 0.09 + balloon.phase) * 0.035;
    }
    const flock = (seconds % 70) / 70;
    birdMaterial.opacity = Math.min(1, daylight + twilight) * (1 - wet);
    for (const bird of birds) {
      bird.group.visible = birdMaterial.opacity > 0.02;
      bird.group.position.set(
        -22 + flock * 44 - bird.lead * 1.4,
        9 + bird.lead * 0.6 + Math.sin(seconds * 0.6 + bird.phase) * 0.3,
        -20 - bird.phase,
      );
      const flap = 0.25 + Math.sin(seconds * 7 + bird.phase * 3) * 0.45;
      bird.left.rotation.z = flap;
      bird.right.rotation.z = -flap;
    }
    return {
      daylight,
      twilight,
      hour,
      sunrise,
      sunset,
      wet,
      sunDirection: sun.position.clone().normalize(),
    };
  };
  update(0, 'auto');
  return {
    root,
    update,
    cloudX: (index: number) => {
      const cloud = clouds[index]!;
      cloud.mesh.getMatrixAt(cloud.index, placement);
      return placement.elements[12]!;
    },
  };
}
