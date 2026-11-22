// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostCall } from '@botharness/host-client/host-answer';
import type { SessionModelState } from '@botharness/host-protocol/session-model';
import type { SettingsRowProps } from '../src/ui/primitives/settings-row-model';
import type { SheetFrameProps } from '../src/ui/chat/sheet-frame';

vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('../src/ui/chat/sheet-frame', () => ({
  SheetFrame: ({ visible, children }: SheetFrameProps) =>
    visible ? <div role="dialog">{children}</div> : null,
}));
vi.mock('../src/ui/primitives/drawer-header', () => ({
  DrawerHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsGroupItem: ({ children }: { children: ReactNode }) => children,
  SettingsRow: ({ testID, title, trailing, selected, onPress, detail }: SettingsRowProps) => (
    <button
      data-testid={testID}
      aria-pressed={selected}
      disabled={onPress === undefined}
      onClick={onPress}
    >
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

const { SessionModelChip, SessionModelPicker, useSessionModelControl } =
  await import('../src/ui/chat/session-model-composer');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

function ComposerModel({ host, width = 390 }: { host: HostCall; width?: number }) {
  const control = useSessionModelControl({
    host,
    slug: 'ada',
    enabled: true,
    sessionId: 'current',
    running: true,
    target: { ...target, kind: 'dsh' },
  });
  return (
    <>
      <SessionModelChip control={control} width={width} disabled={false} />
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
  expect(button('composer-session-model').textContent).toBe('Next turn: Opus 5.5High');

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
  expect(button('composer-session-model').textContent).toBe('Next turn: Opus 5.5High');
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
  await act(async () => root.render(<ComposerModel host={host} width={390} />));
  expect(call.mock.calls).toHaveLength(2);
  await act(async () => root.render(<ComposerModel host={host} width={205} />));
  expect(button('composer-session-model').textContent).toBe('');
  expect(call.mock.calls).toHaveLength(2);
});
