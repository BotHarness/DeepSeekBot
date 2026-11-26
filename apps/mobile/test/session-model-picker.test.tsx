// @vitest-environment jsdom
import { notifyManager } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostCall } from '@botharness/host-client/host-answer';
import type { SessionModelState } from '@botharness/host-protocol/session-model';
import type { SettingsRowProps } from '../src/ui/primitives/settings-row-model';
import type { SheetFrameProps } from '../src/ui/chat/sheet-frame';

vi.mock('../src/ui/primitives/preference-row', async () => {
  const { useState } = await import('react');
  return {
    PreferenceRow: ({
      testID,
      title,
      value,
      options,
      onChange,
    }: {
      testID: string;
      title: string;
      value: string;
      options: { value: string; label: string }[];
      onChange(value: string): void;
    }) => {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button data-testid={testID} onClick={() => setOpen(!open)}>
            {title}
            {options.find((option) => option.value === value)?.label}
          </button>
          {open
            ? options.map((option) => (
                <button
                  key={option.value}
                  data-testid={`${testID}-${option.value}`}
                  onClick={() => {
                    setOpen(false);
                    onChange(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))
            : null}
        </div>
      );
    },
  };
});
vi.mock('../src/host/native-model-catalog', () => ({
  nativeModelCatalogStore: { read: () => undefined, write: () => {} },
}));
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('../src/ui/chat/sheet-frame', () => ({
  SheetFrame: ({ visible, children, resizable }: SheetFrameProps) =>
    visible ? (
      <div role="dialog" data-resizable={String(resizable)}>
        {children}
      </div>
    ) : null,
}));
vi.mock('../src/ui/primitives/drawer-header', () => ({
  DrawerHeader: ({
    title,
    onClose,
    trailing,
  }: {
    title: string;
    onClose?: () => void;
    trailing?: ReactNode;
  }) => (
    <h2>
      {title}
      {onClose === undefined ? null : <button aria-label="Close" onClick={onClose} />}
      {trailing}
    </h2>
  ),
  HeaderButton: ({
    label,
    testID,
    onPress,
  }: {
    label: string;
    testID?: string;
    onPress(): void;
  }) => <button aria-label={label} data-testid={testID} onClick={onPress} />,
}));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsGroupItem: ({ children }: { children: ReactNode }) => children,
  SettingsRow: ({
    testID,
    title,
    leading,
    trailing,
    selected,
    onPress,
    detail,
  }: SettingsRowProps) => (
    <button
      data-testid={testID}
      aria-pressed={selected}
      disabled={onPress === undefined}
      onClick={onPress}
    >
      {leading}
      {title}
      {trailing}
      {detail}
    </button>
  ),
}));
vi.mock('../src/ui/chat/model-brand-icon', () => ({
  ModelBrandIcon: ({ brand }: { brand?: string }) => <span data-brand={brand} />,
}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress(): void }) => (
    <button onClick={onPress}>{label}</button>
  ),
}));
vi.mock('../src/ui/primitives/loading-indicator', () => ({
  LoadingIndicator: () => <span role="progressbar" />,
}));

const { SessionModelLogo, SessionModelPicker, useSessionModelControl, useSessionModelMenuLabel } =
  await import('../src/ui/chat/session-model-composer');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
notifyManager.setScheduler((run) => run());

const api = { kind: 'model', provider: 'opencode-go', model: 'deepseek-v4.1-flash' } as const;
const engine = {
  kind: 'engine',
  engine: 'claude',
  accountId: 'granted',
  model: 'claude-opus-5-5',
  effort: 'high',
} as const;
const target = { kind: 'dsh', provider: api.provider, model: api.model };
const defaultState = { override: null, default: api, active: null };
const catalog = {
  models: [{ ...api, providerName: 'OpenCode Go', modelName: 'DeepSeek V4.1 Flash' }],
  groups: [{ id: 'routing', name: 'QA routing', revision: 1, routes: [api] }],
  routingGroupEngines: [
    {
      engine: 'claude',
      accountId: 'granted',
      available: true,
      models: [{ id: engine.model, name: 'Claude Opus 5.5', defaultEffort: 'high' }],
    },
  ],
};

const hostIds = new WeakMap<HostCall, string>();
function hostId(host: HostCall) {
  const known = hostIds.get(host);
  if (known !== undefined) return known;
  const next = `host-${Math.random()}`;
  hostIds.set(host, next);
  return next;
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

function ComposerModel({ host, fresh = false }: { host: HostCall; fresh?: boolean }) {
  const control = useSessionModelControl({
    host,
    hostId: hostId(host),
    slug: 'ada',
    enabled: true,
    sessionId: fresh ? undefined : 'current',
    running: !fresh,
    target: { ...target, kind: 'dsh' },
  });
  return (
    <>
      <SessionModelLogo control={control} disabled={false} />
      <SessionModelPicker control={control} />
    </>
  );
}

function button(id: string) {
  const element = container.querySelector(`[data-testid="${id}"]`);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button ${id}`);
  return element;
}

it('selects a granted Subscription Engine and keeps the saved choice on Host refusal', async () => {
  let saved: SessionModelState = defaultState;
  let allow = true;
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'modelCatalog') return catalog;
    if (method === 'sessionModel' && args !== undefined && 'choice' in args) {
      if (!allow) throw new Error('model-not-allowed');
      saved = { ...defaultState, override: engine };
    }
    return saved;
  });
  const host = { call };
  await act(async () => root.render(<ComposerModel host={host} />));
  await act(async () => button('composer-session-model').click());
  expect(container.textContent).toContain('QA routing');
  expect(button('session-model-option-model-0').textContent).toContain('API');
  expect(button('session-model-option-engine-0').textContent).toContain('Sub');

  await act(async () => button('session-model-option-engine-0').click());
  expect(call).toHaveBeenCalledWith('sessionModel', {
    slug: 'ada',
    sessionId: 'current',
    choice: engine,
  });
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(button('composer-session-model').getAttribute('aria-label')).toContain(
    'Next turn: Opus 5.5',
  );

  allow = false;
  await act(async () => button('composer-session-model').click());
  await act(async () => button('session-model-option-default').click());
  expect(call).toHaveBeenCalledWith('sessionModel', {
    slug: 'ada',
    sessionId: 'current',
    choice: null,
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'Couldn’t change this session’s model choice.',
  );
  expect(button('session-model-option-engine-0').getAttribute('aria-pressed')).toBe('true');
  expect(button('composer-session-model').getAttribute('aria-label')).toContain(
    'Next turn: Opus 5.5',
  );
});

it('shows the brand at Send icon size while the catalog loads', async () => {
  const call = vi.fn(async (method: string) =>
    method === 'modelCatalog' ? new Promise(() => {}) : defaultState,
  );
  await act(async () => root.render(<ComposerModel host={{ call }} />));
  expect(button('composer-session-model').textContent).toBe('');
  expect(button('composer-session-model').querySelector('[data-brand="deepseek"]')).not.toBeNull();
});

it('does not reload the Session or catalog for layout-only composer updates', async () => {
  const call = vi.fn(async (method: string) => {
    if (method === 'modelCatalog') return catalog;
    return defaultState;
  });
  const host = { call };
  await act(async () => root.render(<ComposerModel host={host} />));
  expect(call.mock.calls).toHaveLength(2);
  await act(async () => root.render(<ComposerModel host={host} />));
  expect(button('composer-session-model').textContent).toBe('');
  expect(call.mock.calls).toHaveLength(2);
});

function CompactModel({ host }: { host: HostCall }) {
  const control = useSessionModelControl({
    host,
    hostId: hostId(host),
    slug: 'ada',
    enabled: true,
    sessionId: 'current',
    running: true,
    target: { ...target, kind: 'dsh' },
  });
  const menu = useSessionModelMenuLabel(control);
  return (
    <>
      <SessionModelLogo control={control} disabled={false} />
      <span data-testid="menu-row">{menu}</span>
      <SessionModelPicker control={control} />
    </>
  );
}

it('shows the pending model as a logo, names it in the title menu and explains the next turn in the sheet', async () => {
  const pending: SessionModelState = { override: engine, default: api, active: api };
  const call = vi.fn(async (method: string) => (method === 'modelCatalog' ? catalog : pending));
  await act(async () => root.render(<CompactModel host={{ call }} />));
  const logo = button('composer-session-model');
  expect(logo.textContent).toBe('');
  expect(logo.querySelector('[data-brand]')?.getAttribute('data-brand')).toBe('claude');
  expect(logo.getAttribute('aria-label')).toContain('Next turn: Opus 5.5');
  expect(container.querySelector('[data-testid="menu-row"]')?.textContent).toBe(
    'Model: Next turn: Opus 5.5 · High',
  );
  await act(async () => logo.click());
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
    'Next turn: Opus 5.5 · This turn keeps its model. Your pick applies from the next turn.',
  );
});

it('opens on a half-height sheet with skeleton rows while the first catalog load is pending', async () => {
  let finish: (value: typeof catalog) => void = () => {};
  const call = vi.fn(async (method: string) =>
    method === 'modelCatalog'
      ? new Promise<typeof catalog>((resolve) => (finish = resolve))
      : defaultState,
  );
  await act(async () => root.render(<ComposerModel host={{ call }} />));
  await act(async () => button('composer-session-model').click());
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog?.getAttribute('data-resizable')).toBe('true');
  expect(dialog?.querySelector('[data-testid="sheet-skeleton"]')).not.toBeNull();
  expect(dialog?.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBeTruthy();
  await act(async () => finish(catalog));
  expect(container.querySelector('[data-testid="sheet-skeleton"]')).toBeNull();
  expect(button('session-model-option-default')).toBeDefined();
});

it('shows the cached models at once on the next open without reloading a fresh catalog', async () => {
  const call = vi.fn(async (method: string) =>
    method === 'modelCatalog' ? catalog : defaultState,
  );
  await act(async () => root.render(<ComposerModel host={{ call }} />));
  await act(async () => button('composer-session-model').click());
  expect(button('session-model-option-default')).toBeDefined();
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click(),
  );
  expect(container.querySelector('[role="dialog"]')).toBeNull();

  const before = call.mock.calls.filter(([method]) => method === 'modelCatalog').length;
  await act(async () => button('composer-session-model').click());
  expect(container.querySelector('[data-testid="sheet-skeleton"]')).toBeNull();
  expect(button('session-model-option-model-0').textContent).toContain('API');
  expect(call.mock.calls.filter(([method]) => method === 'modelCatalog').length).toBe(before);
});

it('reloads the catalog from the refresh button and keeps the rows while it loads', async () => {
  let pending: Promise<typeof catalog> | undefined;
  let release: () => void = () => {};
  const call = vi.fn(async (method: string) => {
    if (method !== 'modelCatalog') return defaultState;
    return pending ?? catalog;
  });
  await act(async () => root.render(<ComposerModel host={{ call }} />));
  await act(async () => button('composer-session-model').click());
  const before = call.mock.calls.filter(([method]) => method === 'modelCatalog').length;

  pending = new Promise((resolve) => (release = () => resolve(catalog)));
  await act(async () => button('session-model-refresh').click());
  expect(call.mock.calls.filter(([method]) => method === 'modelCatalog').length).toBe(before + 1);
  expect(container.querySelector('[data-testid="sheet-skeleton"]')).toBeNull();
  expect(container.querySelector('[data-testid="session-model-refresh"]')).toBeNull();
  expect(button('session-model-option-model-0').textContent).toContain('API');
  await act(async () => release());
  expect(button('session-model-refresh')).toBeDefined();
});

it('keeps the cached models when a background refresh fails', async () => {
  let fail = false;
  const call = vi.fn(async (method: string) => {
    if (method !== 'modelCatalog') return defaultState;
    if (fail) throw new Error('offline');
    return catalog;
  });
  const host = { call };
  await act(async () => root.render(<ComposerModel host={host} />));
  fail = true;
  await act(async () => button('composer-session-model').click());
  expect(button('session-model-option-model-0').textContent).toContain('API');
  expect(container.textContent).not.toContain('Couldn’t load');
});

it('names the default model and its brand on "Use Bot default", also before a new Session starts', async () => {
  const call = vi.fn(async (method: string) =>
    method === 'modelCatalog' ? catalog : { override: null, default: api },
  );
  await act(async () => root.render(<ComposerModel host={{ call }} fresh />));
  expect(call).toHaveBeenCalledWith('sessionModel', { slug: 'ada' });
  const logo = button('composer-session-model');
  expect(logo.textContent).toBe('');
  expect(logo.querySelector('[data-brand]')?.getAttribute('data-brand')).toBe('deepseek');
  expect(logo.getAttribute('aria-label')).toContain('V4.1 Flash');
  await act(async () => button('composer-session-model').click());
  const row = button('session-model-option-default');
  expect(row.textContent).toContain('Use Bot default');
  expect(row.textContent).toContain('V4.1 Flash');
  expect(row.querySelector('[data-brand]')?.getAttribute('data-brand')).toBe('deepseek');
});

function NewNativeSession({ host }: { host: HostCall }) {
  const control = useSessionModelControl({
    host,
    hostId: hostId(host),
    slug: null,
    enabled: true,
    sessionId: undefined,
    running: false,
  });
  return (
    <>
      <SessionModelLogo control={control} disabled={false} />
      <SessionModelPicker control={control} />
    </>
  );
}

it('names the Default preset model on a new native Session and filters by provider', async () => {
  const call = vi.fn(async (method: string) =>
    method === 'modelCatalog'
      ? {
          ...catalog,
          default: api,
          models: [
            ...catalog.models,
            {
              provider: 'opencode-go',
              providerName: 'OpenCode Go',
              model: 'claude-haiku-5-5',
              modelName: 'Claude Haiku 5.5',
            },
          ],
        }
      : defaultState,
  );
  await act(async () => root.render(<NewNativeSession host={{ call }} />));
  await act(async () => button('composer-session-model').click());
  const row = button('session-model-option-default');
  expect(row.textContent).toContain('Use the Default preset');
  expect(row.textContent).toContain('V4.1 Flash');
  expect(container.querySelectorAll('[data-testid^="session-model-option-model"]')).toHaveLength(2);
  await act(async () => button('session-model-filter-api:claude').click());
  expect(container.querySelectorAll('[data-testid^="session-model-option-model"]')).toHaveLength(1);
  expect(button('session-model-option-default')).toBeDefined();
  await act(async () => button('session-model-filter-api:claude').click());
  expect(container.querySelectorAll('[data-testid^="session-model-option-model"]')).toHaveLength(2);
});

it('chooses the reasoning effort for the selected model and keeps the sheet open', async () => {
  let saved: SessionModelState = { ...defaultState, override: engine };
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'modelCatalog')
      return {
        ...catalog,
        routingGroupEngines: [
          {
            ...catalog.routingGroupEngines[0],
            models: [
              {
                id: engine.model,
                name: 'Claude Opus 5.5',
                defaultEffort: 'high',
                efforts: [
                  { id: 'high', name: 'High' },
                  { id: 'max', name: 'Max' },
                ],
              },
            ],
          },
        ],
      };
    if (method === 'sessionModel' && args !== undefined && 'choice' in args)
      saved = { ...saved, override: args['choice'] as SessionModelState['override'] };
    return saved;
  });
  await act(async () => root.render(<ComposerModel host={{ call }} />));
  await act(async () => button('composer-session-model').click());
  expect(button('session-model-effort').textContent).toContain('High');
  await act(async () => button('session-model-effort').click());
  await act(async () => button('session-model-effort-max').click());
  expect(call).toHaveBeenCalledWith('sessionModel', {
    slug: 'ada',
    sessionId: 'current',
    choice: { ...engine, effort: 'max' },
  });
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(button('session-model-effort').textContent).toContain('Max');
  await act(async () => button('session-model-effort').click());
  expect(button('session-model-effort-').textContent).toBe('Model default · High');
  await act(async () => button('session-model-effort-').click());
  const { effort: _effort, ...bare } = engine;
  expect(call).toHaveBeenCalledWith('sessionModel', {
    slug: 'ada',
    sessionId: 'current',
    choice: bare,
  });
});
