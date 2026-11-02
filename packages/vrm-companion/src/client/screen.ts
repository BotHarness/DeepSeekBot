import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
} from 'three';

export type ScreenMode = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked';

const WIDTH = 512;
const HEIGHT = 288;
const ROW = 21;
const TOKENS = ['#e3ae86', '#7fb6c8', '#c4a1dc', '#9fd09a', '#d9d2c0', '#6f8d99'];
const SPILL: Record<ScreenMode, number> = {
  idle: 0xb9a2ff,
  thinking: 0x86b8ff,
  working: 0x7fb2ff,
  waiting: 0xffc98a,
  blocked: 0xff8a7a,
};

const random = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const codeLine = (index: number) => {
  const indent = Math.floor(random(index) * 4) * 14;
  const tokens: Array<[number, string]> = [];
  const count = random(index + 0.3) < 0.12 ? 0 : 1 + Math.floor(random(index + 0.7) * 5);
  for (let i = 0; i < count; i++)
    tokens.push([
      14 + Math.floor(random(index * 7 + i) * 52),
      TOKENS[Math.floor(random(index * 3 + i * 1.3) * TOKENS.length)]!,
    ]);
  return { indent, tokens, width: tokens.reduce((sum, [width]) => sum + width + 6, indent) };
};

export function createScreen(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture });
  const mesh = new Mesh(new PlaneGeometry(width, height), material);
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = 128;
  haloCanvas.height = 96;
  const haloContext = haloCanvas.getContext('2d')!;
  const gradient = haloContext.createRadialGradient(64, 48, 8, 64, 48, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  haloContext.fillStyle = gradient;
  haloContext.fillRect(0, 0, 128, 96);
  const haloTexture = new CanvasTexture(haloCanvas);
  const haloMaterial = new MeshBasicMaterial({
    map: haloTexture,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    color: new Color(SPILL.working),
    opacity: 0,
  });
  const halo = new Mesh(new PlaneGeometry(width * 1.7, height * 2), haloMaterial);
  halo.position.z = -0.04;
  halo.renderOrder = 2;
  mesh.add(halo);
  const light = new PointLight(SPILL.working, 0, 1.4, 2);
  const target = new Color(SPILL.working);
  let mode: ScreenMode = 'working';
  let drawn = -1;
  let typed = 9;
  let logs = 0;

  const editor = (time: number, cursor: boolean) => {
    g.fillStyle = '#1d2a35';
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle = '#16212a';
    g.fillRect(0, 0, 44, HEIGHT);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i === 1 ? '#7fb6c8' : '#3c4d58';
      g.fillRect(14, 34 + i * 26, 16, 12);
    }
    g.fillStyle = '#22323e';
    g.fillRect(44, 0, WIDTH - 44, 22);
    g.fillStyle = '#2c4150';
    g.fillRect(52, 4, 96, 18);
    g.fillStyle = '#e3ae86';
    g.fillRect(60, 11, 10, 4);
    g.fillStyle = '#a9bcc4';
    g.fillRect(76, 11, 56, 4);
    const line = Math.floor(typed);
    const rows = 11;
    const first = Math.max(0, line - rows + 2);
    for (let row = 0; row < rows; row++) {
      const index = first + row;
      if (index > line) break;
      const y = 34 + row * ROW;
      g.fillStyle = index === line ? '#5d7482' : '#3b4c57';
      g.fillRect(52, y, 8 + (index % 3) * 4, 7);
      if (index === line) {
        g.fillStyle = 'rgba(255,255,255,0.04)';
        g.fillRect(44, y - 6, WIDTH - 44, ROW);
      }
      const { indent, tokens, width } = codeLine(index);
      const limit = index === line ? (typed - line) * width : width;
      let x = 84 + indent;
      for (const [size, color] of tokens) {
        const visible = Math.min(size, limit - (x - 84));
        if (visible <= 0) break;
        g.fillStyle = color;
        g.fillRect(x, y, visible, 8);
        x += size + 6;
      }
      if (index === line && cursor && Math.floor(time * 2.4) % 2 === 0) {
        g.fillStyle = '#f2ede2';
        g.fillRect(84 + limit + 2, y - 4, 3, 16);
      }
    }
    g.fillStyle = '#2a5d7a';
    g.fillRect(0, HEIGHT - 12, WIDTH, 12);
    g.fillStyle = '#cfe2ea';
    g.fillRect(10, HEIGHT - 8, 40, 4);
    g.fillRect(WIDTH - 70, HEIGHT - 8, 56, 4);
  };

  const terminal = (time: number) => {
    g.fillStyle = '#121b22';
    g.fillRect(44, 168, WIDTH - 44, 108);
    g.fillStyle = '#22323e';
    g.fillRect(44, 168, WIDTH - 44, 14);
    g.fillStyle = '#9fb0b8';
    g.fillRect(54, 173, 48, 4);
    const count = Math.floor(logs);
    for (let row = 0; row < 5; row++) {
      const index = count - 4 + row;
      if (index < 0) continue;
      g.fillStyle = index === count ? '#e3ae86' : '#5f7f8c';
      g.fillRect(54, 192 + row * 15, 6, 5);
      g.fillStyle = index === count ? '#d9d2c0' : '#7d939c';
      g.fillRect(66, 192 + row * 15, 60 + random(index) * 260, 5);
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle = Math.floor(time * 4) % 3 === i ? '#f2ede2' : '#4b5f6b';
      g.fillRect(WIDTH - 46 + i * 10, 172, 6, 6);
    }
  };

  const dialog = (time: number, color: string) => {
    g.fillStyle = 'rgba(10,16,22,0.55)';
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle = '#26343f';
    g.fillRect(136, 86, 240, 116);
    g.fillStyle = color;
    g.fillRect(136, 86, 240, 6);
    g.fillRect(154, 112, 22, 22);
    g.fillStyle = '#c9d6dc';
    g.fillRect(188, 114, 150, 6);
    g.fillStyle = '#7d939c';
    g.fillRect(188, 128, 112, 5);
    g.fillRect(154, 146, 180, 5);
    g.globalAlpha = 0.65 + Math.sin(time * 3) * 0.35;
    g.fillStyle = color;
    g.fillRect(286, 170, 74, 20);
    g.globalAlpha = 1;
    g.fillStyle = '#3a4a55';
    g.fillRect(204, 170, 74, 20);
  };

  const player = (time: number) => {
    const sky = g.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#2b2547');
    sky.addColorStop(1, '#4c3557');
    g.fillStyle = sky;
    g.fillRect(0, 0, WIDTH, HEIGHT);
    const art = g.createLinearGradient(36, 40, 196, 200);
    art.addColorStop(0, '#f2a46b');
    art.addColorStop(1, '#8f5bb0');
    g.fillStyle = art;
    g.fillRect(36, 40, 160, 160);
    g.fillStyle = 'rgba(255,240,220,0.85)';
    g.beginPath();
    g.arc(140, 92, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a2b4d';
    g.beginPath();
    g.moveTo(36, 200);
    g.lineTo(90, 140);
    g.lineTo(130, 170);
    g.lineTo(196, 120);
    g.lineTo(196, 200);
    g.fill();
    const now = new Date();
    g.fillStyle = '#f4e8dc';
    g.font = '600 46px sans-serif';
    g.fillText(
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      226,
      86,
    );
    g.fillStyle = '#d7c3e6';
    g.fillRect(228, 112, 170, 8);
    g.fillStyle = '#9c86b6';
    g.fillRect(228, 130, 110, 6);
    for (let i = 0; i < 18; i++) {
      const level =
        0.25 + Math.abs(Math.sin(time * (2.1 + (i % 5) * 0.6) + i * 1.7)) * 0.75 * (1 - i / 30);
      g.fillStyle = i % 2 ? '#f2a46b' : '#e58aa8';
      g.fillRect(228 + i * 14, 196 - level * 46, 9, level * 46);
    }
    const progress = (time % 150) / 150;
    g.fillStyle = '#5a4870';
    g.fillRect(36, 236, 440, 5);
    g.fillStyle = '#f2a46b';
    g.fillRect(36, 236, 440 * progress, 5);
    g.fillStyle = '#f4e8dc';
    g.beginPath();
    g.arc(36 + 440 * progress, 238.5, 6, 0, Math.PI * 2);
    g.fill();
  };

  const draw = (time: number) => {
    if (mode === 'idle') player(time);
    else {
      editor(time, mode === 'working');
      if (mode === 'thinking') terminal(time);
      if (mode === 'waiting') dialog(time, '#f0b36a');
      if (mode === 'blocked') dialog(time, '#e46a5c');
    }
    texture.needsUpdate = true;
  };

  return {
    mesh,
    light,
    textures: [texture, haloTexture],
    setMode(value: ScreenMode) {
      if (value === mode) return;
      mode = value;
      drawn = -1;
    },
    update(seconds: number, time: number, night: number) {
      if (mode === 'working') typed += seconds * (0.9 + random(Math.floor(typed)) * 1.6);
      if (mode === 'thinking') logs += seconds * 3.2;
      target.setHex(SPILL[mode]);
      light.color.lerp(target, Math.min(1, seconds * 2 + (drawn < 0 ? 0.2 : 0)));
      haloMaterial.color.copy(light.color);
      light.intensity = 0.08 + night * 0.65;
      haloMaterial.opacity = night * 0.12;
      material.color.setScalar(0.92 + night * 0.18);
      if (drawn < 0 || time - drawn >= 0.1 || seconds === 0) {
        drawn = time;
        draw(time);
      }
    },
  };
}
