import {
  Matrix4,
  AmbientLight,
  HemisphereLight,
  PMREMGenerator,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  Box3,
  Clock,
  DirectionalLight,
  PerspectiveCamera,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
  Quaternion,
  Euler,
  Group,
  Object3D,
  Color,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  SphereGeometry,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { BotPresentationSnapshot } from '@botharness/ui/panels';
import { RoomMotion, type MotionCommand } from './motion.js';
import { FACE_EXPRESSIONS, FaceBlend, dominantFace, faceTarget, type FaceWeights } from './face.js';
import { IdleScheduler, type IdleAction } from './idle.js';
import { createRoom, type Mood, type Weather } from './room.js';
import { enableLilToon } from '@mochiya/three-liltoon';
import { createCharacterShading, type CharacterShading } from './shading.js';
import { createPost } from './post.js';

export type CameraView = 'desk' | 'room' | 'portrait';
export interface SceneState {
  phase: string;
  wandering: boolean;
  ready: boolean;
}
export interface SceneChoices {
  camera: CameraView;
  mood: Mood;
  weather: Weather;
  shading: CharacterShading;
  effects: boolean;
  tour?: boolean;
}
export interface StageCallbacks {
  loading(value: string): void;
  error(value: string): void;
  changed(state: SceneState): void;
}
export interface Stage {
  update(snapshot: BotPresentationSnapshot): void;
  command(command: MotionCommand): void;
  camera(view: CameraView): void;
  mood(value: Mood): void;
  weather(value: Weather): void;
  effects(value: boolean): void;
  tour(value: boolean): void;
  shading(value: CharacterShading): void;
  dispose(): void;
}
const GRIP = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const SIDEWAYS = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const REST_CURL = [0.22, 0.3, 0.38, 0.46];
const SPREAD = [-1, -0.3, 0.4, 1];
const TAP_FINGERS = ['Index', 'Index', 'Middle', 'Middle', 'Ring', 'Little'] as const;
const noise = (seed: number) => {
  const value = Math.sin(seed * 91.7 + 13.1) * 43758.5453;
  return value - Math.floor(value);
};
const TURNED = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
export function mountStage(
  host: HTMLElement,
  model: string,
  { loading, error, changed }: StageCallbacks,
  initial: SceneChoices = {
    camera: 'desk',
    mood: 'auto',
    weather: 'clear',
    shading: 'mtoon',
    effects: true,
  },
  { headphones: wearing = true }: { headphones?: boolean } = {},
): Stage {
  for (const key of Object.keys(host.dataset))
    if (key !== 'vrmStage' && key.startsWith('vrm')) delete host.dataset[key];
  const started = performance.now();
  let disposed = false;
  let vrm: VRM | undefined;
  let face: FaceBlend | undefined;
  let frame = 0;
  let visible = true;
  let latest: BotPresentationSnapshot | undefined;
  const motion = new RoomMotion();
  const idle = new IdleScheduler();
  let room: ReturnType<typeof createRoom> | undefined;
  let shading: ReturnType<typeof createCharacterShading> | undefined;
  let hipDrop = 0;
  let floorOffset = 0;
  let modelScale = 1;
  let legacy = false;
  let phase = 0;
  let gait = 0;
  let strokes = 0;
  let keyWeight = 0;
  let inboxSeen: number | undefined;
  let attend = 0;
  let nod = 0;
  let pausing = false;
  let blinkAt = 2;
  let blinkStart = -1;
  let blinkTwice = false;
  const gazeVelocity = new Vector3();
  let cameraView: CameraView = initial.camera;
  let previousState = '';
  let width = 0,
    height = 0,
    last = 0;
  let frames = 0,
    elapsed = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new Scene();
  scene.background = new Color(0x423a42);
  const actor = new Group();
  scene.add(actor);
  const gaze = new Object3D();
  scene.add(gaze);
  const camera = new PerspectiveCamera(38, 1, 0.05, 100);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  const releaseLilToon = enableLilToon(renderer);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  const environment = new RoomEnvironment();
  const generator = new PMREMGenerator(renderer);
  const environmentMap = generator.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 0.3;
  environment.dispose();
  generator.dispose();
  renderer.shadowMap.type = PCFSoftShadowMap;
  const RATIOS = [1.5, 1.25, 1, 0.75];
  let ratioStep = RATIOS.findIndex((value) => value <= Math.min(devicePixelRatio, 1.5));
  if (ratioStep < 0) ratioStep = RATIOS.length - 1;
  renderer.setPixelRatio(RATIOS[ratioStep]!);
  let pace = 60;
  let windowStart = 0,
    windowFrames = 0,
    windowWork = 0,
    slowWindows = 0,
    fastWindows = 0,
    promoteAfter = 5;
  const post = createPost(renderer);
  const rim = new Color();
  const warm = new Color();
  let effects = initial.effects !== false;
  host.dataset.vrmEffects = effects ? 'on' : 'off';
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  renderer.domElement.setAttribute('aria-label', 'VRM character');
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.8;
  controls.maxDistance = 7;
  controls.minAzimuthAngle = -Math.PI * 0.45;
  controls.maxAzimuthAngle = Math.PI * 0.45;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.48;
  const ambient = new AmbientLight(0xffe7cf, 0.55);
  scene.add(ambient);
  const fill = new HemisphereLight(0xd5e3ed, 0xb48261, 0.7);
  scene.add(fill);
  const key = new DirectionalLight(0xffd8b8, 0.9);
  key.position.set(-1, 2, 3);
  scene.add(key);
  const clock = new Clock();
  const base = new Map<string, Quaternion>();
  const framing = (view: CameraView | 'wide' | 'shoulder') => {
    const portrait = view === 'portrait';
    const target = portrait
      ? new Vector3(motion.x, 1.16 - motion.seated * 0.1, motion.z)
      : view === 'shoulder'
        ? new Vector3(0.42, 1.05, 0.6)
        : new Vector3(0.5, 1.02, 0.1);
    const offset =
      view === 'room'
        ? new Vector3(1.9, 1.5, 4.0)
        : portrait
          ? new Vector3(0.8, 0.12, 1.15)
          : view === 'wide'
            ? new Vector3(1.35, 0.5, 1.45)
            : view === 'shoulder'
              ? new Vector3(0.5, 0.5, -1.15)
              : new Vector3(0.88, 0.18, 0.72);
    const aspectScale =
      view === 'desk'
        ? Math.max(1, Math.min(1.8, 1.7 / camera.aspect))
        : Math.max(1, Math.min(1.25, 0.75 / camera.aspect));
    offset.multiplyScalar(aspectScale);
    return { target, position: target.clone().add(offset) };
  };
  const fitCamera = (view: CameraView) => {
    cameraView = view;
    const { target, position } = framing(view);
    controls.target.copy(target);
    camera.position.copy(position);
    camera.lookAt(target);
    controls.update();
    host.dataset.vrmCamera = view;
  };
  const SHOTS = ['desk', 'portrait', 'wide', 'shoulder', 'room'] as const;
  let touring = !!initial.tour;
  host.dataset.vrmTour = touring ? 'on' : 'off';
  let shot = 0;
  let hold = 0;
  let paused = 0;
  let glide:
    | { from: Vector3; fromTarget: Vector3; to: Vector3; toTarget: Vector3; t: number }
    | undefined;
  const tourStep = (delta: number) => {
    if (!touring) return;
    if (paused > 0) {
      paused -= delta;
      return;
    }
    if (glide) {
      glide.t = Math.min(1, glide.t + delta / (reduced.matches ? 0.001 : 3));
      const ease = glide.t * glide.t * (3 - 2 * glide.t);
      camera.position.lerpVectors(glide.from, glide.to, ease);
      controls.target.lerpVectors(glide.fromTarget, glide.toTarget, ease);
      if (glide.t >= 1) glide = undefined;
      return;
    }
    if (!reduced.matches) {
      const orbit = camera.position.clone().sub(controls.target);
      orbit.applyAxisAngle(new Vector3(0, 1, 0), delta * 0.012);
      camera.position.copy(controls.target).add(orbit);
    }
    hold += delta;
    if (hold < 12) return;
    hold = 0;
    shot = (shot + 1) % SHOTS.length;
    const next = framing(SHOTS[shot]!);
    glide = {
      from: camera.position.clone(),
      fromTarget: controls.target.clone(),
      to: next.position,
      toTarget: next.target,
      t: 0,
    };
    host.dataset.vrmShot = SHOTS[shot];
  };
  controls.addEventListener('start', () => {
    glide = undefined;
    paused = 20;
  });
  const notify = () => {
    const next = `${motion.phase}:${motion.wandering}:${!!vrm}`;
    if (next !== previousState) {
      previousState = next;
      changed({ phase: motion.phase, wandering: motion.wandering, ready: !!vrm });
    }
    host.dataset.vrmMotion = motion.phase;
    host.dataset.vrmSeated = motion.seated.toFixed(3);
    host.dataset.vrmPosition = `${motion.x.toFixed(3)},${motion.z.toFixed(3)}`;
  };
  const release = (value: VRM) => {
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
  };
  const canDraw = () =>
    !disposed &&
    visible &&
    !document.hidden &&
    width > 0 &&
    height > 0 &&
    !renderer.getContext().isContextLost();
  const pose = (bone: VRMHumanBoneName, x: number, y: number, z: number, factor: number) => {
    const node = vrm?.humanoid.getNormalizedBoneNode(bone);
    if (!node) return;
    const initial = base.get(bone) ?? node.quaternion.clone();
    base.set(bone, initial);
    node.quaternion.slerp(
      initial
        .clone()
        .multiply(new Quaternion().setFromEuler(new Euler(legacy ? -x : x, y, legacy ? -z : z))),
      reduced.matches ? 1 : factor,
    );
  };
  const draw = (time: number) => {
    frame = 0;
    if (!canDraw()) return;
    frame = requestAnimationFrame(draw);
    if (last && time - last < 1000 / (reduced.matches ? 10 : pace) - 4) return;
    const passed = clock.getDelta();
    const delta = Math.min(passed, 0.05);
    last = time;
    const daylight = room?.update(reduced.matches ? 0 : delta);
    if (daylight) {
      ambient.intensity = 0.26 + daylight.daylight * 0.34 + daylight.twilight * 0.02;
      ambient.color
        .setHex(0x5a78b8)
        .lerp(new Color(0xffe7cf), Math.min(1, daylight.daylight + daylight.twilight))
        .lerp(new Color(0xff8a5a), daylight.twilight * 0.7);
      fill.intensity = 0.18 + daylight.daylight * 0.67 + daylight.twilight * 0.12;
      key.intensity = 0.28 + daylight.daylight * 0.82 + daylight.twilight * 0.05;
      key.color
        .setHex(0x9fb2ff)
        .lerp(new Color(0xffd8b8), Math.min(1, daylight.daylight + daylight.twilight));
      scene.environmentIntensity = 0.06 + daylight.daylight * 0.39 + daylight.twilight * 0.2;
      post.grade(daylight);
      shading?.rim(
        rim
          .setRGB(0.1, 0.09, 0.08)
          .lerp(warm.setRGB(0.4, 0.17, 0.06), daylight.twilight)
          .lerp(
            warm.setRGB(0.06, 0.1, 0.22),
            Math.max(0, 1 - daylight.daylight - daylight.twilight),
          ),
      );
      host.dataset.vrmHour = daylight.hour.toFixed(3);
      host.dataset.vrmSunrise = daylight.sunrise.toFixed(2);
      host.dataset.vrmSunset = daylight.sunset.toFixed(2);
      host.dataset.vrmAssets = room?.assets;
    }
    if (vrm) {
      const moving =
        !reduced.matches && latest?.sync === 'live' && latest.available && !latest.paused;
      phase += delta;
      const activity = latest?.activity ?? 'idle';
      const live = latest?.sync === 'live' && latest.available && !latest.paused;
      room?.setScreen(live && motion.phase === 'seated' ? activity : 'idle');
      motion.step(delta, {
        enabled: !!live,
        idle: activity === 'idle' && !latest?.speaking,
        reduced: reduced.matches,
      });
      gait += delta * 7 * motion.stride;
      actor.position.set(motion.x, floorOffset - hipDrop * motion.seated, motion.z);
      actor.rotation.y = motion.yaw;
      notify();
      const sway = moving ? Math.sin(phase * 1.5) * 0.015 : 0;
      const thinking = activity === 'thinking';
      const working = activity === 'working';
      const blocked = activity === 'blocked';
      const waiting = activity === 'waiting';
      const conversing = !!moving && !!latest?.conversing;
      const talking = moving && latest?.speaking;
      const pause = conversing && !latest?.speaking;
      if (pause && !pausing && !reduced.matches) nod = 1;
      pausing = pause;
      nod = Math.max(0, nod - delta * 1.6);
      const nodding = Math.sin(nod * Math.PI) * 0.09;
      const blend = 1 - Math.exp(-delta * 10);
      const sit = motion.seated;
      const walk = Math.sin(gait) * 0.28 * motion.stride;
      const resting =
        !!live &&
        activity === 'idle' &&
        !latest?.speaking &&
        !conversing &&
        motion.phase === 'seated' &&
        sit >= 1 &&
        !reduced.matches;
      const idleFrame = idle.step(delta, resting);
      const settled = conversing && idleFrame.weight < 0.05;
      attend = reduced.matches
        ? settled
          ? 1
          : 0
        : Math.max(0, Math.min(1, attend + (settled ? delta * 1.4 : -delta * 1.1)));
      const attention = attend * attend * (3 - 2 * attend);
      host.dataset.vrmAttending = attention > 0.5 ? 'true' : 'false';
      actor.updateMatrixWorld(true);
      const toCamera = camera.position.clone().sub(actor.position);
      const turn = Math.atan2(
        Math.sin(Math.atan2(toCamera.x, toCamera.z) - motion.yaw),
        Math.cos(Math.atan2(toCamera.x, toCamera.z) - motion.yaw),
      );
      const facingViewer = Math.max(
        attention,
        idleFrame.action === 'chin' ? idleFrame.weight * 0.7 : 0,
      );
      const twist = Math.max(-1.1, Math.min(1.1, turn)) * facingViewer;
      const doing = (action: IdleAction) => (idleFrame.action === action ? idleFrame.weight : 0);
      const outside = doing('window');
      const stretch = doing('stretch');
      const chin = doing('chin');
      const sip = doing('sip');
      const glance = doing('glance');
      const browse = doing('phone');
      const drinkPath = (progress: number) => {
        const span = (from: number, to: number) => {
          const t = Math.max(0, Math.min(1, (progress - from) / (to - from)));
          return t * t * (3 - 2 * t);
        };
        return {
          reach: span(0, 0.22) - span(0.86, 1),
          lift: span(0.24, 0.42) - span(0.68, 0.84),
          tilt: span(0.4, 0.48) - span(0.6, 0.68),
        };
      };
      const drink = sip ? drinkPath(idleFrame.progress) : { reach: 0, lift: 0, tilt: 0 };
      const handset = browse
        ? (() => {
            const span = (from: number, to: number) => {
              const t = Math.max(0, Math.min(1, (idleFrame.progress - from) / (to - from)));
              return t * t * (3 - 2 * t);
            };
            return {
              reach: span(0, 0.15) - span(0.9, 1),
              lift: span(0.17, 0.32) - span(0.7, 0.84),
            };
          })()
        : { reach: 0, lift: 0 };
      host.dataset.vrmIdle = idleFrame.action ?? 'none';
      pose(
        'spine',
        sway + (working ? 0.04 : 0) - stretch * 0.14 + sip * drink.reach * 0.12 * (1 - drink.lift),
        -outside * 0.3 - sip * drink.reach * 0.2 * (1 - drink.lift) + twist * 0.22,
        0,
        blend,
      );
      pose('chest', 0, twist * 0.2, 0, blend);
      pose('neck', nodding * 0.4, twist * 0.18, 0, blend);
      pose('rightShoulder', 0, sip * drink.reach * 0.15 * (1 - drink.lift), 0, blend);
      const looking = facingViewer > 0.4 || talking || waiting || blocked || glance > 0.5;
      const desk = room?.tableY ?? 0.75;
      const inbox = latest?.inbox ?? 0;
      if (inboxSeen !== undefined && inbox > inboxSeen && latest?.available && !latest.paused)
        room?.notice();
      if (inboxSeen !== inbox) host.dataset.vrmInbox = String(inbox);
      inboxSeen = inbox;
      const crown =
        vrm.humanoid.getNormalizedBoneNode('head')?.getWorldPosition(new Vector3()) ??
        new Vector3(motion.x, 1.3, motion.z);
      const noticed = room?.noticeStep(delta, reduced.matches, crown);
      host.dataset.vrmNotice = room?.noticing ? 'true' : 'false';
      const desiredGaze = looking
        ? camera.position.clone()
        : thinking && live
          ? new Vector3(motion.x - 0.9, desk + 1.6, motion.z + 1.2)
          : browse > 0 && room
            ? room.phone.getWorldPosition(new Vector3())
            : sip > 0 && room
              ? room.mug.getWorldPosition(new Vector3())
              : new Vector3(-0.36, desk + 0.48, 0.78);
      if (outside > 0) desiredGaze.lerp(new Vector3(-2.4, desk + 1.1, -0.9), outside);
      if (noticed?.glance && room && !talking)
        desiredGaze.lerp(room.phone.getWorldPosition(new Vector3()), noticed.glance);
      if (reduced.matches) gaze.position.copy(desiredGaze);
      else {
        const spring = Math.min(delta, 0.05);
        gazeVelocity
          .addScaledVector(desiredGaze.sub(gaze.position), 28 * spring)
          .multiplyScalar(Math.exp(-spring * 10.5));
        gaze.position.addScaledVector(gazeVelocity, spring);
      }
      const ease = reduced.matches ? 1 : 1 - Math.exp(-delta * 6);
      const head = vrm.humanoid.getNormalizedBoneNode('head');
      const headPosition =
        head?.getWorldPosition(new Vector3()) ?? new Vector3(motion.x, 1.2, motion.z);
      const direction = gaze.position.clone().sub(headPosition);
      const yaw = Math.atan2(
        Math.sin(Math.atan2(direction.x, direction.z) - motion.yaw),
        Math.cos(Math.atan2(direction.x, direction.z) - motion.yaw),
      );
      pose(
        'head',
        (thinking ? -0.1 : blocked ? 0.1 : working && !conversing ? 0.08 : sway * (1 - attention)) +
          nodding -
          stretch * 0.25 +
          chin * 0.06 -
          sip * drink.lift * 0.22 +
          browse * handset.lift * 0.3,
        Math.max(-0.35, Math.min(0.35, yaw * 0.4)) * (1 - facingViewer) +
          Math.max(-0.5, Math.min(0.5, (turn - twist * 0.6) * 0.8)) * facingViewer +
          (waiting ? -0.1 : 0) -
          outside * 0.25,
        (talking ? Math.sin(phase * 5) * 0.025 : 0) - chin * 0.14,
        ease,
      );
      const atKeys =
        moving && motion.phase === 'seated'
          ? (working ? 1 : thinking ? 0.7 : 0) * (1 - attention)
          : 0;
      keyWeight = reduced.matches
        ? atKeys
        : keyWeight +
          (atKeys - keyWeight) * (1 - Math.exp(-delta * (atKeys > keyWeight ? 2.5 : 1.25)));
      const typing = keyWeight < 0.01 ? 0 : keyWeight;
      const burst = Math.max(0, Math.min(1, (noise(Math.floor(phase / 2.6)) - 0.18) * 3));
      const musing = noise(Math.floor(phase / 1.7) + 7) > 0.55;
      const rhythm = working ? 'fast' : thinking && musing ? 'slow' : 'none';
      const pace = rhythm === 'fast' ? 6 + burst * 2 : rhythm === 'slow' ? 2.5 : 0;
      const mid = strokes - Math.floor(strokes);
      strokes =
        pace > 0
          ? strokes + delta * pace * Math.min(1, typing * 1.4)
          : mid > 0
            ? Math.min(Math.ceil(strokes), strokes + delta * 4)
            : strokes;
      if (host.dataset.vrmTyping !== (typing ? rhythm : 'none'))
        host.dataset.vrmTyping = typing ? rhythm : 'none';
      const key = Math.floor(strokes);
      const stroke = strokes - key;
      const hit =
        stroke < 0.3
          ? Math.sin((stroke / 0.3) * (Math.PI / 2))
          : Math.cos(((stroke - 0.3) / 0.7) * (Math.PI / 2)) ** 2;
      const tapSide = noise(key) < 0.5 ? 'left' : 'right';
      const tapFinger = TAP_FINGERS[Math.floor(noise(key + 0.5) * TAP_FINGERS.length)]!;
      const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
      pose(
        'leftUpperArm',
        mix(-sit * 1.05 + walk, -0.2, stretch),
        0,
        mix(-1.4, 1.15, stretch),
        blend,
      );
      pose(
        'rightUpperArm',
        mix(-sit * 1.05 - walk, -0.2, stretch),
        0,
        mix(1.4, -1.15, stretch),
        blend,
      );
      pose(
        'leftLowerArm',
        mix(-0.12 - sit * 0.28 - (thinking ? 0.15 : 0), -0.35, stretch),
        0,
        0,
        blend,
      );
      pose(
        'rightLowerArm',
        mix(-0.12 - sit * 0.28 - (talking ? Math.sin(phase * 2) * 0.06 : 0), -0.35, stretch),
        0,
        0,
        blend,
      );
      pose('leftUpperLeg', (-sit * Math.PI) / 2 + walk, 0, 0, blend);
      pose('rightUpperLeg', (-sit * Math.PI) / 2 - walk, 0, 0, blend);
      pose('leftLowerLeg', (sit * Math.PI) / 2 + Math.max(0, -walk) * 1.4, 0, 0, blend);
      pose('rightLowerLeg', (sit * Math.PI) / 2 + Math.max(0, walk) * 1.4, 0, 0, blend);
      pose('leftFoot', -Math.max(0, -walk) * 0.4, 0, 0, blend);
      pose('rightFoot', -Math.max(0, walk) * 0.4, 0, 0, blend);
      pose('leftHand', 0, 0, stretch * 0.9, blend);
      pose('rightHand', 0, 0, -stretch * 0.9, blend);
      const reach = sit * (1 - stretch);
      let rightGoal: Vector3 | undefined;
      let rightWeight = 0;
      let rightGrip: Quaternion | undefined;
      if (room) {
        room.mug.position.copy(room.mugHome);
        room.mug.quaternion.identity();
        room.phone.quaternion.copy(room.phoneRest);
        room.phoneGlow(browse * handset.lift * 0.9);
      }
      if (room && head && (chin > 0 || sip > 0 || browse > 0)) {
        actor.updateMatrixWorld(true);
        const facing = new Vector3(Math.sin(motion.yaw), 0, Math.cos(motion.yaw));
        const mouth = head
          .getWorldPosition(new Vector3())
          .addScaledVector(facing, 0.11 * modelScale)
          .add(new Vector3(0, 0.02 * modelScale, 0));
        if (chin > 0) {
          rightGoal = mouth.clone().add(new Vector3(0.02, -0.1 * modelScale, 0));
          rightWeight = chin;
          const x = new Vector3(0, -1, 0).addScaledVector(facing, 0.25).normalize();
          const y = facing.clone().negate().addScaledVector(x, x.dot(facing)).normalize();
          const rub = reduced.matches ? 0 : Math.sin(phase * 1.7) * 0.08;
          rightGrip = new Quaternion()
            .setFromAxisAngle(new Vector3(0, 1, 0), (0.9 + rub) * chin)
            .multiply(
              new Quaternion().setFromAxisAngle(
                new Vector3(0, 1, 0).cross(facing).normalize(),
                -0.2 * chin,
              ),
            )
            .multiply(
              new Quaternion().setFromRotationMatrix(
                new Matrix4().makeBasis(x, y, x.clone().cross(y)),
              ),
            );
        } else if (browse > 0) {
          const lifted = browse * handset.lift;
          const crown = head.getWorldPosition(new Vector3());
          const side = new Vector3(0, 1, 0).cross(facing).normalize();
          const viewing = crown
            .clone()
            .add(new Vector3(0, -0.2 * modelScale, 0))
            .addScaledVector(facing, 0.25 * modelScale)
            .addScaledVector(side, -0.05 * modelScale);
          const toFace = crown.sub(viewing).normalize();
          const upward = new Vector3(0, 1, 0).addScaledVector(toFace, -toFace.y).normalize();
          const held = new Quaternion().setFromRotationMatrix(
            new Matrix4().makeBasis(toFace.clone().cross(upward), toFace, upward),
          );
          room.phone.position.lerp(viewing, lifted);
          room.phone.quaternion.slerp(held, lifted);
          const screen = new Vector3(0, 1, 0).applyQuaternion(room.phone.quaternion);
          const length = new Vector3(0, 0, 1).applyQuaternion(room.phone.quaternion);
          rightGoal = room.phone.position
            .clone()
            .addScaledVector(length, -0.09)
            .addScaledVector(screen, 0.05 * (1 - lifted) - 0.03 * lifted);
          rightWeight = browse * handset.reach;
          const x = length.clone().negate();
          const y = screen
            .clone()
            .multiplyScalar(1 - 2 * lifted)
            .addScaledVector(side, -Math.sin(lifted * Math.PI));
          y.addScaledVector(x, -x.dot(y)).normalize();
          rightGrip = new Quaternion().setFromRotationMatrix(
            new Matrix4().makeBasis(x, y, x.clone().cross(y)),
          );
        } else {
          const lifted = sip * drink.lift;
          const held = new Quaternion()
            .setFromAxisAngle(new Vector3(1, 0, 0), -0.6 * drink.tilt)
            .multiply(SIDEWAYS);
          const atMouth = mouth.clone().sub(room.mugRim.clone().applyQuaternion(held));
          room.mug.position.lerp(atMouth, lifted);
          room.mug.quaternion.slerp(held, lifted);
          rightGoal = room.mugWrist
            .clone()
            .applyQuaternion(room.mug.quaternion)
            .add(room.mug.position);
          rightGrip = room.mug.quaternion.clone().multiply(GRIP);
          rightWeight = sip * drink.reach;
        }
      }
      if (reach > 0 && room) {
        for (const side of ['left', 'right'] as const) {
          const upper = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
          const lower = vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`);
          const hand = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`);
          if (!upper || !lower || !hand) continue;
          actor.updateMatrixWorld(true);
          const a = upper.getWorldPosition(new Vector3());
          const b = lower.getWorldPosition(new Vector3());
          const c = hand.getWorldPosition(new Vector3());
          const keys = new Vector3(
            (side === 'left' ? 0.66 : 0.48) +
              typing * Math.sin(phase * 0.7 + (side === 'left' ? 0 : 2.1)) * 0.012,
            room.tableY + 0.095 - (side === tapSide ? typing * hit * 0.004 : 0),
            0.13 + typing * Math.sin(phase * 0.5 + (side === 'left' ? 1 : 0)) * 0.006,
          );
          const free = side === 'right' && rightGoal ? rightWeight : 0;
          if (free > 0 && rightGoal) keys.lerp(rightGoal, free);
          const goal = c.clone().lerp(keys, reach);
          const lengthA = a.distanceTo(b),
            lengthB = b.distanceTo(c);
          const direction = goal.clone().sub(a).normalize();
          const distance = Math.max(0.001, Math.min(a.distanceTo(goal), lengthA + lengthB - 0.001));
          const along =
            (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
          const pole = new Vector3(side === 'left' ? 1 : -1, -1, 0);
          pole.addScaledVector(direction, -pole.dot(direction)).normalize();
          const elbow = a
            .clone()
            .addScaledVector(direction, along)
            .addScaledVector(pole, Math.sqrt(Math.max(0, lengthA * lengthA - along * along)));
          const aim = (bone: Object3D, from: Vector3, to: Vector3) => {
            const rotation = new Quaternion()
              .setFromUnitVectors(from.normalize(), to.normalize())
              .multiply(bone.getWorldQuaternion(new Quaternion()));
            bone.quaternion.copy(
              bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation),
            );
            bone.updateWorldMatrix(false, true);
          };
          aim(upper, b.clone().sub(a), elbow.clone().sub(a));
          const elbowNow = lower.getWorldPosition(new Vector3());
          aim(lower, hand.getWorldPosition(new Vector3()).sub(elbowNow), goal.sub(elbowNow));
          const wrist = new Quaternion().setFromEuler(
            new Euler(0, side === 'left' ? -Math.PI / 2 : Math.PI / 2, 0),
          );
          const held = side === 'right' && rightGrip;
          if (held) wrist.slerp(rightGrip!, free);
          if (legacy) wrist.multiply(TURNED);
          hand.quaternion.slerp(
            hand.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(wrist),
            held ? reach : reach * (1 - free * 0.8),
          );
        }
      }
      const grasp = rightGrip ? rightWeight * (browse > 0 ? 0.45 : 1) : 0;
      const quick = reduced.matches ? 1 : 1 - Math.exp(-delta * 24);
      const open = stretch;
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'right' ? 1 : -1;
        const fist = side === 'right' ? grasp : 0;
        for (const [index, finger] of FINGERS.entries()) {
          const neighbor =
            Math.abs(FINGERS.indexOf(finger) - FINGERS.indexOf(tapFinger)) === 1 ? 0.2 : 0;
          const tap = typing && side === tapSide ? hit * (finger === tapFinger ? 1 : neighbor) : 0;
          const breathe = moving
            ? Math.sin(phase * 0.9 + index * 1.3 + (sign > 0 ? 0 : 2)) * 0.03
            : 0;
          const relaxed = (REST_CURL[index]! + breathe) * (1 - open * 0.85) * (1 - typing * 0.5);
          const curl =
            relaxed +
            fist * (0.85 + index * 0.1) +
            typing * (0.32 + (finger === 'Little' ? 0.1 : 0) + tap * 0.5);
          const spread = SPREAD[index]! * (0.04 + open * 0.12) * (1 - fist) * (1 - typing * 0.6);
          pose(`${side}${finger}Proximal`, 0, sign * spread, sign * curl, quick);
          pose(`${side}${finger}Intermediate`, 0, 0, sign * curl * (1.1 - tap * 0.4), quick);
          pose(`${side}${finger}Distal`, 0, 0, sign * curl * (0.6 + fist * 0.2), quick);
        }
        const thumb = Math.max(fist, typing * 0.4, 0.25 * (1 - open));
        pose(
          `${side}ThumbProximal`,
          0,
          sign * (-0.35 * thumb + open * 0.35),
          sign * 0.2 * thumb,
          blend,
        );
        pose(`${side}ThumbDistal`, 0, sign * -0.3 * thumb, 0, blend);
      }
      const expressions = vrm.expressionManager;
      if (expressions?.getExpression('aa'))
        expressions.setValue('aa', moving ? (latest?.mouth ?? 0) : 0);
      if (phase >= blinkAt && blinkStart < 0) {
        blinkStart = phase;
        blinkTwice = noise(blinkAt * 7.3) < 0.2;
      }
      const since = blinkStart < 0 ? -1 : phase - blinkStart;
      const blinkLength = blinkTwice ? 0.42 : 0.16;
      const blink =
        moving && since >= 0 && since < blinkLength
          ? Math.sin(((since % 0.21) / (blinkTwice ? 0.21 : 0.16)) * Math.PI) ** 2
          : 0;
      if (since >= blinkLength) {
        blinkStart = -1;
        blinkAt = phase + 1.8 + noise(phase * 3.1) * 4.2;
      }
      if (expressions?.getExpression('blink')) expressions.setValue('blink', blink);
      if (expressions && face) {
        const target = faceTarget(latest, phase, reduced.matches);
        const accent: Partial<FaceWeights> = {
          relaxed: Math.max(stretch * 0.75, sip * drink.lift * 0.5, chin * 0.3),
          happy: Math.max(glance * 0.45, chin * 0.15),
        };
        for (const [name, value] of Object.entries(accent) as [keyof FaceWeights, number][])
          target[name] = Math.max(target[name], value);
        const weights = face.step(target, delta, reduced.matches);
        for (const name of FACE_EXPRESSIONS)
          if (face.available.has(name)) expressions.setValue(name, weights[name]);
        host.dataset.vrmFace = dominantFace(weights);
      }
      vrm.update(delta);
      host.dataset.vrmMouth = String(expressions?.getValue('aa') ?? 0);
    }
    tourStep(Math.min(passed, 1));
    controls.update();
    shading?.update();
    const started = performance.now();
    const calls = paint();
    const anchor = vrm?.humanoid.getNormalizedBoneNode('head');
    const panel = host.parentElement;
    if (anchor && panel) {
      const point = anchor
        .getWorldPosition(new Vector3())
        .add(new Vector3(0, 0.2 * modelScale, 0))
        .project(camera);
      const x = `${Math.round(((point.x + 1) / 2) * host.clientWidth)}px`;
      const y = `${Math.round(((1 - point.y) / 2) * host.clientHeight)}px`;
      if (panel.style.getPropertyValue('--vrm-head-x') !== x)
        panel.style.setProperty('--vrm-head-x', x);
      if (panel.style.getPropertyValue('--vrm-head-y') !== y)
        panel.style.setProperty('--vrm-head-y', y);
      const width = `${host.clientWidth}px`;
      if (panel.style.getPropertyValue('--vrm-panel-width') !== width)
        panel.style.setProperty('--vrm-panel-width', width);
    }
    frames++;
    elapsed += delta;
    if (frames % 15 === 1) {
      host.dataset.vrmFrames = String(frames);
      host.dataset.vrmGeometries = String(renderer.info.memory.geometries);
      host.dataset.vrmTextures = String(renderer.info.memory.textures);
      host.dataset.vrmCalls = String(calls);
      host.dataset.vrmSeconds = elapsed.toFixed(2);
    }
    measure(time, performance.now() - started);
  };
  const measure = (time: number, work: number) => {
    if (!vrm) return;
    if (!windowStart) windowStart = time;
    windowFrames++;
    windowWork += work;
    const span = time - windowStart;
    if (span < 2000) return;
    const fps = (windowFrames * 1000) / span;
    host.dataset.vrmFps = fps.toFixed(1);
    const average = windowWork / windowFrames;
    host.dataset.vrmWork = average.toFixed(1);
    host.dataset.vrmPixelRatio = String(RATIOS[ratioStep]);
    windowStart = time;
    windowFrames = 0;
    windowWork = 0;
    host.dataset.vrmPace = String(pace);
    const target = reduced.matches ? 10 : pace;
    slowWindows = fps < target * 0.8 ? slowWindows + 1 : 0;
    fastWindows = pace < 60 && fps >= 27 && average < 6 ? fastWindows + 1 : 0;
    if (fastWindows >= promoteAfter && !reduced.matches) {
      fastWindows = 0;
      slowWindows = 0;
      pace = 60;
    } else if (slowWindows >= 2 && pace > 30) {
      slowWindows = 0;
      promoteAfter = Math.min(promoteAfter * 2, 60);
      pace = 30;
    } else if (slowWindows >= 2 && ratioStep < RATIOS.length - 1) {
      slowWindows = 0;
      ratioStep++;
      renderer.setPixelRatio(RATIOS[ratioStep]!);
      renderer.setSize(width, height, false);
      post.setSize(width, height);
      host.dataset.vrmPixelRatio = String(RATIOS[ratioStep]);
    }
  };
  function paint() {
    if (effects) return post.render(scene, camera);
    renderer.render(scene, camera);
    return renderer.info.render.calls;
  }
  const reconcile = () => {
    windowStart = 0;
    windowFrames = 0;
    windowWork = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    clock.getDelta();
    last = 0;
    if (canDraw()) frame = requestAnimationFrame(draw);
  };
  const resize = new ResizeObserver(() => {
    const box = host.getBoundingClientRect();
    width = box.width;
    height = box.height;
    if (width > 0 && height > 0) {
      renderer.setSize(width, height, false);
      post.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fitCamera(cameraView);
      if (canDraw()) paint();
    }
    reconcile();
  });
  resize.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    reconcile();
  });
  intersection.observe(host);
  document.addEventListener('visibilitychange', reconcile);
  reduced.addEventListener('change', reconcile);
  const lost = (event: Event) => {
    event.preventDefault();
    loading('');
    error('3D rendering interrupted. Retry to reload the character.');
    reconcile();
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  loading('Loading character…');
  void loader
    .loadAsync(model)
    .then((gltf) => {
      const loaded = gltf.userData.vrm as VRM | undefined;
      if (!loaded) {
        VRMUtils.deepDispose(gltf.scene);
        throw new Error('invalid_vrm');
      }
      if (disposed) {
        release(loaded);
        return;
      }
      vrm = loaded;
      face = new FaceBlend(
        new Set(FACE_EXPRESSIONS.filter((name) => loaded.expressionManager?.getExpression(name))),
      );
      host.dataset.vrmFaces = [...face.available].join(' ');
      shading = createCharacterShading(loaded.scene);
      host.dataset.vrmShading = 'mtoon';
      if (initial.shading !== 'mtoon') {
        shading.select(initial.shading);
        host.dataset.vrmShading = initial.shading;
      }
      legacy = loaded.meta.metaVersion === '0';
      host.dataset.vrmSpec = legacy ? '0' : '1';
      VRMUtils.rotateVRM0(loaded);
      actor.add(loaded.scene);
      loaded.scene.traverse((object) => {
        if (object instanceof Mesh) object.castShadow = object.receiveShadow = true;
      });
      const box = new Box3().setFromObject(loaded.scene);
      const size = box.getSize(new Vector3());
      modelScale = 1.65 / Math.max(size.y, 0.1);
      actor.scale.setScalar(modelScale);
      floorOffset = -box.min.y * modelScale;
      actor.updateMatrixWorld(true);
      const hips = loaded.humanoid.getNormalizedBoneNode('hips')?.getWorldPosition(new Vector3());
      const knee = loaded.humanoid
        .getNormalizedBoneNode('leftLowerLeg')
        ?.getWorldPosition(new Vector3());
      const ankle = loaded.humanoid
        .getNormalizedBoneNode('leftFoot')
        ?.getWorldPosition(new Vector3());
      const seatHeight = Math.max(
        0.32,
        Math.min(0.58, (knee?.y ?? 0.45) - (ankle?.y ?? 0.05) + 0.04),
      );
      hipDrop = (hips?.y ?? 0.9) + floorOffset - seatHeight - 0.07;
      room = createRoom(seatHeight);
      room.setWeather(initial.weather);
      room.setMood(initial.mood);
      host.dataset.vrmMood = initial.mood;
      host.dataset.vrmWeather = initial.weather;
      scene.remove(key);
      scene.add(room.root);
      scene.add(key);
      actor.position.set(motion.x, floorOffset - hipDrop, motion.z);
      const rawHead = loaded.humanoid.getRawBoneNode('head');
      if (rawHead && wearing) {
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
      }
      if (loaded.lookAt) loaded.lookAt.target = gaze;
      gaze.position.copy(camera.position);
      fitCamera(initial.camera);
      notify();
      loading('');
      host.dataset.vrmLoaded = 'true';
      host.dataset.vrmLoadMs = String(Math.round(performance.now() - started));
      reconcile();
    })
    .catch(() => {
      if (disposed) return;
      loading('');
      error('Character could not load. Bot activity and messages remain available.');
    });
  return {
    update(snapshot) {
      latest = snapshot;
    },
    command(command) {
      if (!vrm || !latest?.available || latest.paused || latest.sync !== 'live') return;
      motion.command(command);
      notify();
    },
    camera(view) {
      if (!disposed) fitCamera(view);
    },
    mood(value) {
      room?.setMood(value);
      host.dataset.vrmMood = value;
    },
    tour(value) {
      touring = value;
      glide = undefined;
      hold = 0;
      paused = 0;
      host.dataset.vrmTour = value ? 'on' : 'off';
    },
    effects(value) {
      effects = value;
      host.dataset.vrmEffects = value ? 'on' : 'off';
    },
    weather(value) {
      room?.setWeather(value);
      host.dataset.vrmWeather = value;
    },
    shading(value) {
      shading?.select(value);
      host.dataset.vrmShading = value;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const name of ['--vrm-head-x', '--vrm-head-y', '--vrm-panel-width'])
        host.parentElement?.style.removeProperty(name);
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      reduced.removeEventListener('change', reconcile);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      controls.dispose();
      key.shadow.dispose();
      room?.dispose();
      shading?.dispose();
      releaseLilToon();
      post.dispose();
      environmentMap.dispose();
      if (vrm) {
        actor.remove(vrm.scene);
        release(vrm);
        vrm = undefined;
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
