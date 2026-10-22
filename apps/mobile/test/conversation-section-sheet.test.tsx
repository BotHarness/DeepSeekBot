// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { state, client, back } = vi.hoisted(() => ({
  state: {
    hostId: 'h1',
    sections: [{ id: 's-existing', name: 'Host work', channelIds: [] as string[] }],
  },
  client: {
    call: vi.fn(async (_method: string, _args?: Record<string, unknown>): Promise<unknown> => ({})),
    refresh: vi.fn(async () => {}),
  },
  back: vi.fn(),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ hostId: 'h1', channelId: 'dm-ada' }),
  useRouter: () => ({ back }),
}));
vi.mock('../src/host/host-session', () => ({
  hostSession: { getState: () => ({ saved: { hostId: state.hostId }, client }) },
  useHostSession: () => ({ saved: { hostId: state.hostId }, client }),
  useHostSnapshot: () => ({ roster: { arrangement: { sections: state.sections } } }),
}));
import Screen from '../app/conversation-section';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let view: HTMLElement;
async function render() {
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
  await act(async () => root.render(<Screen />));
}
async function press(label: string) {
  const button = [...view.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.getAttribute('aria-label') === label,
  )!;
  expect(button, label).toBeDefined();
  await act(async () => button.click());
}
async function typeName(name: string) {
  const field = view.querySelector<HTMLTextAreaElement>('[data-testid="section-name"]')!;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!;
  await act(async () => {
    setter.call(field, name);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
afterEach(() => {
  act(() => root?.unmount());
  view?.remove();
  client.call.mockReset();
  client.call.mockResolvedValue({});
  client.refresh.mockReset();
  client.refresh.mockResolvedValue();
  back.mockReset();
  state.hostId = 'h1';
  state.sections = [{ id: 's-existing', name: 'Host work', channelIds: [] }];
});
describe('native section sheet source behavior', () => {
  it('reads Host sections and assigns the chosen section', async () => {
    await render();
    await press('Host work');
    expect(client.call).toHaveBeenCalledWith('channelAssign', {
      channelId: 'dm-ada',
      sectionId: 's-existing',
    });
    expect(client.refresh).toHaveBeenCalledOnce();
    expect(back).toHaveBeenCalledOnce();
  });
  it('offers creation with no sections and retains the created choice across assignment failure', async () => {
    state.sections = [];
    client.call
      .mockResolvedValueOnce({ section: { id: 'new-id', name: 'New work' } })
      .mockRejectedValueOnce(Error('offline'));
    await render();
    expect(view.textContent).toContain(t.conversationSection.empty);
    await press(t.conversationSection.create);
    await typeName(' New work ');
    await press(t.conversationSection.submit);
    expect(view.textContent).toContain(t.conversationSection.assignFailed);
    expect(view.textContent).toContain('New work');
    expect(view.querySelector('[data-testid="section-name"]')).toBeNull();
    expect(back).not.toHaveBeenCalled();
    await press(t.retry);
    expect(client.call.mock.calls).toEqual([
      ['sectionCreate', { name: 'New work' }],
      ['channelAssign', { channelId: 'dm-ada', sectionId: 'new-id' }],
      ['channelAssign', { channelId: 'dm-ada', sectionId: 'new-id' }],
    ]);
    expect(back).toHaveBeenCalledOnce();
  });
  it('keeps the typed name and distinguishes a creation failure', async () => {
    client.call.mockRejectedValueOnce(Error('invalid'));
    await render();
    await press(t.conversationSection.create);
    await typeName('Work');
    await press(t.conversationSection.submit);
    expect(view.textContent).toContain(t.conversationSection.createFailed);
    expect(view.querySelector<HTMLTextAreaElement>('[data-testid="section-name"]')!.value).toBe(
      'Work',
    );
    expect(back).not.toHaveBeenCalled();
  });
  it('hides stale sections and refuses creation after switching Hosts', async () => {
    await render();
    state.hostId = 'h2';
    state.sections = [{ id: 's-other', name: 'Other Host', channelIds: [] }];
    await act(async () => root.render(<Screen />));
    expect(view.textContent).not.toContain('Other Host');
    expect(view.textContent).not.toContain('Host work');
    expect(view.textContent).toContain(t.conversationSection.changed);
    await press(t.conversationSection.create);
    expect(view.querySelector('[data-testid="section-name"]')).toBeNull();
    expect(client.call).not.toHaveBeenCalled();
  });
});
