// @vitest-environment jsdom
import { type ComputerSettings } from '../src/settings.js';
import { type ComputerKey } from '../src/client/locale.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buttonNamed, shellPrimitives } from '../../client/test/primitive-mocks.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => shellPrimitives());

import {
  ComputerSettingsPrefs,
  createComputerSettingsFace,
  ComputerSettingsRows,
} from '../src/client/settings-rows.js';

import { en, type ComputerTranslate } from '../src/client/locale.js';

const t = ((key: ComputerKey, params?: Record<string, unknown>) => {
  let text = en[key];
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}) as ComputerTranslate;

const disposers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mountWithArchives(files: string[] | 'error') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const value: ComputerSettings = {
    target: 'container',
    exportDir: '/old',
    idleStopMinutes: 30,
    autoAllowActions: false,
  };
  let listener = () => {};
  const prefs = new ComputerSettingsPrefs();
  prefs.attach({
    getSnapshot: () => ({ status: 'ready', writable: true, value }),
    subscribe: (notify) => {
      listener = notify;
      return () => {};
    },
    set: async () => {},
  });
  void listener;
  vi.stubGlobal('fetch', async (url: string) => {
    if (typeof url === 'string' && url.endsWith('/api/computer/exports')) {
      if (files === 'error') return Response.json({ error: { code: 'x' } }, { status: 500 });
      return Response.json({ files });
    }
    if (typeof url === 'string' && url.endsWith('/api/computer/status')) {
      return Response.json({ exportDir: '/host-default' });
    }
    return Response.json({});
  });
  const face = createComputerSettingsFace({ prefs });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(ComputerSettingsRows, { ...face, t } as Parameters<
        typeof ComputerSettingsRows
      >[0]),
    );
  });
  disposers.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return container;
}

describe('Computer Settings import menu', () => {
  it('keeps the menu closed and notes the empty state when no archives exist', async () => {
    const container = await mountWithArchives([]);
    const button = buttonNamed('Import…', container);
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    await act(async () => {});
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.querySelector('[role="menuitem"]')).toBeNull();
    expect(container.textContent).toContain('No archives in that directory yet');
  });

  it('opens the archive menu when archives exist', async () => {
    const container = await mountWithArchives(['a.tar', 'b.tar']);
    const button = buttonNamed('Import…', container);
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    await act(async () => {});
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const items = [...document.body.querySelectorAll('[role="menuitem"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(items).toEqual(['a.tar', 'b.tar']);
  });

  it('toggles the menu closed on a second click', async () => {
    const container = await mountWithArchives(['a.tar']);
    const button = buttonNamed('Import…', container);
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    await act(async () => {});
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    await act(async () => {});
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.querySelector('[role="menuitem"]')).toBeNull();
  });
});
