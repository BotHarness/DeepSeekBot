// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));

import { Linking } from 'react-native';

import { PairingGuide } from '../src/ui/shell/pairing-guide';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  vi.restoreAllMocks();
});

async function render(initiallyOpen?: boolean): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<PairingGuide {...(initiallyOpen === undefined ? {} : { initiallyOpen })} />),
  );
  return host;
}

it('stays collapsed until tapped when the user already has a computer', async () => {
  const view = await render();
  const toggle = view.querySelector<HTMLElement>('[data-testid="pair-guide-toggle"]')!;
  expect(toggle.textContent).toContain(t.pairGuide.title);
  expect(view.textContent).not.toContain(t.pairGuide.steps[0]);

  await act(async () => toggle.click());
  for (const step of t.pairGuide.steps) expect(view.textContent).toContain(step);

  await act(async () => toggle.click());
  expect(view.textContent).not.toContain(t.pairGuide.steps[0]);
});

it('tells a new user what the computer needs and opens the site guide', async () => {
  const openURL = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const view = await render(true);
  for (const step of t.pairGuide.steps) expect(view.textContent).toContain(step);
  expect(t.pairGuide.url).toMatch(/^https:\/\/deepseekbot\.app\/(en\/)?docs\/mobile-pairing\/$/u);

  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="pair-guide-open"]')!.click(),
  );
  expect(openURL).toHaveBeenCalledWith(t.pairGuide.url);
  expect(view.querySelector('[role="alert"]')).toBeNull();
});

it('says so when the guide cannot be opened', async () => {
  vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));
  const view = await render(true);
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="pair-guide-open"]')!.click(),
  );
  expect(view.querySelector('[role="alert"]')?.textContent).toBe(t.pairGuide.linkError);
});
