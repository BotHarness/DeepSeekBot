import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

import { build } from 'tsdown';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clientBundleOptions } from '../../../tsdown.config.js';

interface LoadedEntry {
  id: string;
  factory: (require: (id: string) => unknown) => Record<string, unknown>;
}

const requireFromTest = createRequire(import.meta.url);
const tempDir = mkdtempSync(join(tmpdir(), 'botharness-client-bundle-'));

const BASELINE_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
  '@deepseek-ai/dsh-api-gateway/client',
]);

function isBaselineModule(id: string): boolean {
  return BASELINE_MODULES.has(id) || id.startsWith('react/');
}

function baselineModuleStub(id: string): Record<string, unknown> {
  if (id === '@deepseek-ai/dsh-api-gateway/client') {
    return {
      RemoteJournalStream: class {},
      RemoteSnapshotStream: class {},
      RemoteStreamCarrierError: class extends Error {},
    };
  }
  if (id === '@deepseek-ai/dsh-client-store') {
    return {
      createSnapshotStore(initial: Record<string, unknown>) {
        let snapshot = initial;
        const listeners = new Set<() => void>();
        return {
          getSnapshot: () => snapshot,
          subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
          update(recipe: (draft: Record<string, unknown>) => void) {
            snapshot = { ...snapshot };
            recipe(snapshot);
            for (const listener of listeners) listener();
          },
        };
      },
    };
  }
  const stub: Record<string, unknown> = {};
  return new Proxy(stub, {
    get: (target, property) => {
      if (typeof property !== 'string') return undefined;
      if (!(property in target)) target[property] = () => null;
      return target[property];
    },
  });
}

const shellRequire = (id: string): unknown =>
  id.startsWith('@deepseek-ai/') ? baselineModuleStub(id) : requireFromTest(id);

let bundleCode = '';
let entry: LoadedEntry | undefined;

function loadedEntry(): LoadedEntry {
  if (entry === undefined) throw new Error('the bundle did not call __ModuleLoader__.load');
  return entry;
}

beforeAll(async () => {
  await build({ ...clientBundleOptions, config: false, outDir: tempDir });
  bundleCode = readFileSync(join(tempDir, 'client.js'), 'utf8');
  const sandbox = {
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      location: { hash: '' },
      __ModuleLoader__: {
        load: (loaded: LoadedEntry) => {
          entry = loaded;
        },
      },
    },
    fetch: globalThis.fetch,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    EventTarget,
    console,
  };
  vm.createContext(sandbox);
  new vm.Script(bundleCode, { filename: 'client.js' }).runInContext(sandbox);
}, 60_000);

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('@botharness/ui browser bundle', () => {
  it('does not defer Node environment reads to browser interactions', () => {
    expect(bundleCode).not.toMatch(/\bprocess\.env\b/);
  });
  it('self-registers with the lazy-CJS module-loader contract', () => {
    const loaded = loadedEntry();
    expect(loaded.id).toBe('@botharness/ui');
    expect(loaded.factory).toBeTypeOf('function');
  });

  it('uses a package ID that the RC2 Client Modules HMR path can resolve', () => {
    expect(loadedEntry().id).not.toMatch(/\/client$/);
  });

  it('externalizes the shell baseline and inlines everything else', () => {
    const required = [...bundleCode.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(required.length).toBeGreaterThan(0);
    expect(required.every((id) => id !== undefined && isBaselineModule(id))).toBe(true);
    expect(required).toContain('@deepseek-ai/dsh-client-ui-primitives');
    const nonBaselineShell = required.filter(
      (id) => typeof id === 'string' && id.startsWith('@deepseek-ai/') && !BASELINE_MODULES.has(id),
    );
    expect(nonBaselineShell).toEqual([]);
  });

  it('compiles StyleX at build time and ships every class it uses in the plugin stylesheet', () => {
    expect(bundleCode).not.toContain('@bh-stylex-css');
    expect(bundleCode).not.toMatch(/require\("@stylexjs\//);
    expect(bundleCode).not.toMatch(/Unexpected 'stylex\.\w+' call at runtime/);
    const classes = new Set(
      [...bundleCode.matchAll(/"(bhx[a-z0-9]+(?: bhx[a-z0-9]+)*)"/g)].flatMap((match) =>
        match[1]!.split(' '),
      ),
    );
    expect(classes.size).toBeGreaterThan(40);
    const missing = [...classes].filter((name) => !bundleCode.includes(`.${name}`));
    expect(missing).toEqual([]);
    expect(bundleCode).toMatch(
      /\.bhx[a-z0-9]+(?::not\(#\\\\#\))+\{color:var\(--dsw-alias-label-primary\)\}/,
    );
  });

  it('exposes the plugin and registers the bot-mode panel plus the @ mention source', () => {
    const plugin = loadedEntry().factory(shellRequire);
    expect(plugin['name']).toBe('botharness-client');
    expect(plugin['inject']).toEqual([
      'slots',
      'connection',
      'inputTriggers',
      'layout',
      'locale',
      'sessions',
      'uiWorkspace',
      'workspaces',
      'remote',
      'remote.session',
    ]);

    const registered: {
      name: string;
      id?: string;
      key?: string;
      order?: number;
      label?: string;
    }[] = [];
    const sources: unknown[] = [];
    const scoped = {
      slots: {
        inject: (_name: string, callback: () => unknown) => callback(),
        register: (spec: {
          name: string;
          id?: string;
          key?: string;
          order?: number;
          label?: string;
        }) => {
          registered.push(spec);
          return () => undefined;
        },
      },
      remote: { session: {} },
      connection: {
        rpc: {
          call: async () => ({ ok: true, value: { bots: [] } }),
        },
      },
      layout: {
        selectPanel: () => undefined,
        panelInfo: {
          getSnapshot: () => ({ activePanelId: null }),
          subscribe: () => () => undefined,
        },
      },
      inputTriggers: {
        registerSource: (source: unknown) => {
          sources.push(source);
          return () => undefined;
        },
      },
      locale: {
        subscribe: () => () => undefined,
        register: () => () => undefined,
        bind: () => (key: string) => key,
      },
      sessions: {
        list: { subscribe: () => () => undefined, getSnapshot: () => ({ ids: [], byId: {} }) },
      },
      provide: () => () => undefined,
      effect: (callback: () => unknown) => {
        callback();
        return () => undefined;
      },
      inject: () => undefined,
    };

    (plugin['apply'] as (ctx: unknown) => void)(scoped);

    expect(registered).toEqual([
      {
        name: 'shell.overlay',
        id: 'botharness-window-companion',
        locale: 'botharness',
        inject: expect.any(Function),
      },
      {
        name: 'shell.overlay',
        id: 'botharness-bot-settings',
        locale: 'botharness',
        inject: expect.any(Function),
        children: { 'botharness.settings.section': { kind: 'list', scope: 'root' } },
      },
      {
        name: 'shell.overlay',
        id: 'botharness-shortcut-help',
        locale: 'botharness',
        inject: expect.any(Function),
      },
      {
        name: 'sidebar.panellist',
        id: 'botharness',
        order: 10,
        label: expect.any(Function),
        locale: 'botharness',
        inject: expect.any(Function),
      },
      {
        name: 'main',
        key: 'botharness',
        locale: 'botharness',
        inject: expect.any(Function),
      },
      {
        name: 'conversation.session.header.actions',
        id: 'botharness-return-to-bot',
        order: 15,
        label: expect.any(Function),
        locale: 'botharness',
        inject: expect.any(Function),
      },
      {
        name: 'sidebar.session.row.leading',
        id: 'botharness-session-owner-avatar',
        order: 20,
        locale: 'botharness',
        inject: expect.any(Function),
      },
      {
        name: 'sidebar.workspaces.session.menu.item',
        id: 'botharness-return-to-bot-menu',
        order: 500,
        label: expect.any(Function),
        locale: 'botharness',
        inject: expect.any(Function),
      },
    ]);
    expect(sources).toHaveLength(1);
    expect((sources[0] as { trigger?: string }).trigger).toBe('@');
  });
});
