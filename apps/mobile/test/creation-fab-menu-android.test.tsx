// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('../src/ui/primitives/drawer-material', () => ({ DrawerMaterial: () => null }));
import { CreationPanel } from '../src/ui/shell/creation-panel.android';
import { creationTargets } from '../src/host/creation-targets';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
const pick = vi.fn(),
  close = vi.fn();
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  pick.mockReset();
  close.mockReset();
});
async function render(scope = 'all') {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <CreationPanel
        scope={scope}
        targets={creationTargets({ hostId: 'mac', name: 'Mac' }, [])}
        bottom={20}
        size={64}
        busy={false}
        onClose={close}
        onPick={pick}
      />,
    ),
  );
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
it('Android FAB menu asks All to choose a target even when only one Computer is available', async () => {
  await render();
  await click(t.newChannel);
  expect(pick).not.toHaveBeenCalled();
  await click('Mac');
  expect(pick).toHaveBeenCalledWith('channel', expect.objectContaining({ hostId: 'mac' }));
});
it('Android FAB menu offers only Computer actions in its selected scope', async () => {
  await render(computerEnvironmentKey('mac'));
  expect(host.textContent).not.toContain(t.cloudJoin.title);
  await click(t.newPersonaBot);
  expect(pick).toHaveBeenCalledWith('bot', expect.objectContaining({ hostId: 'mac' }));
});
it('Android FAB menu dismisses without selecting a background destination', async () => {
  await render();
  await click(t.close);
  expect(close).toHaveBeenCalledOnce();
  expect(pick).not.toHaveBeenCalled();
});
it('Android FAB menu joins directly without inventing a Computer target', async () => {
  await render();
  await click(t.cloudJoin.title);
  expect(pick).toHaveBeenCalledWith('join');
});
it('Android FAB menu goes back from the target step and closes from the FAB position', async () => {
  await render();
  await click(t.newChannel);
  expect(host.textContent).toContain(t.chooseCreationTarget);
  await click(t.back);
  expect(host.textContent).toContain(t.newPersonaBot);
  expect(host.textContent).not.toContain(t.chooseCreationTarget);
});
