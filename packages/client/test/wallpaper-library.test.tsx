// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Appearance } from '../src/client/appearance.js';
import { appearanceMaterials } from '../src/client/appearance-materials.js';
import { Wallpaper } from '../src/client/wallpaper.js';
import { WallpaperLibrary } from '../src/client/wallpaper-library.js';
import { memoryWallpaperStore } from './wallpaper-memory.js';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const t = ((key: string, params?: Record<string, unknown>) =>
  params?.n === undefined ? key : `${key} ${params.n}`) as never;
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

function fixture(materials?: object) {
  let raw = JSON.stringify({
    version: 1,
    revision: 'prefs-0',
    preference: 'system',
    modes: { light: { preset: 'classic-blue', ...materials }, dark: { preset: 'classic-blue' } },
  });
  let n = 0;
  const appearance = new Appearance(
    { getItem: () => raw, setItem: (_key, value) => void (raw = value) },
    () => 'light',
    () => `prefs-${++n}`,
  );
  const memory = memoryWallpaperStore();
  const owner = new Wallpaper(memory.store, async (blob) => ({
    blob,
    url: `blob:${Math.random()}`,
    width: 1600,
    height: 1000,
    release: () => {},
  }));
  return { appearance, owner, memory };
}

it('adds dropped files, shows the newest, and turns untuned panels see-through once', async () => {
  const f = fixture({ materials: { header: { opacity: 95 } } });
  const onChange = vi.fn();
  await f.owner.refresh();
  act(() =>
    root.render(
      <WallpaperLibrary owner={f.owner} t={t} appearance={f.appearance} onChange={onChange} />,
    ),
  );
  const add = host.querySelector<HTMLButtonElement>('button[aria-label="wallpaper.upload"]')!;
  const files = [
    new File(['a'], 'a.png', { type: 'image/png' }),
    new File(['b'], 'b.png', { type: 'image/png' }),
  ];
  act(() => {
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.assign(drop, { dataTransfer: { files } });
    add.dispatchEvent(drop);
  });
  await settle();
  const items = host.querySelectorAll('[data-wallpaper-item]');
  expect(items).toHaveLength(2);
  expect(f.memory.library().items).toHaveLength(2);
  expect(host.querySelector('[aria-pressed="true"][aria-label="wallpaper.item 2"]')).not.toBeNull();
  expect(onChange).toHaveBeenCalledTimes(1);
  const config = f.appearance.getSnapshot().config;
  expect(appearanceMaterials(config.modes.light, 'light').header.opacity).toBe(95);
  expect(appearanceMaterials(config.modes.dark, 'dark')).toMatchObject({
    header: { opacity: 80 },
    body: { opacity: 50, blur: 2 },
  });

  act(() =>
    host.querySelector<HTMLButtonElement>('button[aria-label="wallpaper.noneLabel"]')!.click(),
  );
  await settle();
  expect(f.owner.getSnapshot().current).toBeUndefined();
  act(() =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="wallpaper.remove · wallpaper.item 1"]')!
      .click(),
  );
  await settle();
  expect(f.memory.library().items).toHaveLength(1);
  f.owner.dispose();
});
