// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { zhTranslate } from '../src/client/locale.js';
import {
  SessionLinkRail,
  SessionOpenContext,
  sessionMentionId,
  withSessionMentionLinks,
} from '../src/client/session-links.js';
import { updateSessionViewPreference } from '../src/client/session-view-prefs.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const links = [
  { sessionId: 'asg-1', kind: 'sent' as const, title: '整理发布说明' },
  { sessionId: 'asg-2', kind: 'sent' as const, title: '迁移虚拟滚动' },
  { sessionId: 'asg-3', kind: 'created' as const, title: '调研 Lark 签名' },
];

async function render(
  open: (botSlug: string | undefined, sessionId: string, title: string) => void,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  await act(async () => {
    root.render(
      createElement(
        SessionOpenContext.Provider,
        { value: open },
        createElement(SessionLinkRail, { botSlug: 'tobs', kind: 'sent', links, t: zhTranslate }),
        createElement(SessionLinkRail, { botSlug: 'tobs', kind: 'created', links, t: zhTranslate }),
      ),
    );
  });
  return host;
}

it('folds several sent Sessions, expands them and opens one', async () => {
  const open = vi.fn();
  const host = await render(open);
  const toggle = host.querySelector<HTMLButtonElement>('[data-session-links-toggle]')!;
  expect(toggle.textContent).toBe('转给 2 个会话');
  expect(host.querySelector('[data-session-link="asg-1"]')).toBeNull();
  await act(async () => toggle.click());
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-session-link="asg-2"]')!.click(),
  );
  expect(open).toHaveBeenCalledWith('tobs', 'asg-2', '迁移虚拟滚动');
  expect(host.querySelector('[data-session-links="created"]')?.textContent).toContain(
    '调研 Lark 签名',
  );
});

it('curves only beside the first row and keeps a straight line toward the message', async () => {
  const host = await render(vi.fn());
  const sent = host.querySelector('[data-session-links="sent"]')!;
  const paths = () =>
    [...sent.querySelectorAll(':scope > svg path')].map((path) => path.getAttribute('d'));
  expect(paths()).toEqual(['M2 20 V10 Q2 6 6 6 H14']);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-session-links-toggle]')!.click(),
  );
  expect(host.querySelector('[data-session-links-toggle]')?.getAttribute('aria-expanded')).toBe(
    'true',
  );
  expect(paths()).toEqual(['M2 20 V10 Q2 6 6 6 H14', 'M2 0 V20', 'M2 0 V20']);
  expect(
    [...host.querySelectorAll('[data-session-links="created"] > svg path')].map((path) =>
      path.getAttribute('d'),
    ),
  ).toEqual(['M2 0 V10 Q2 14 6 14 H14']);
});

it('hides the links when the Bot turns them off', async () => {
  updateSessionViewPreference('tobs', (current) => ({ ...current, links: false }));
  const host = await render(vi.fn());
  expect(host.querySelector('[data-session-links]')).toBeNull();
  updateSessionViewPreference('tobs', (current) => ({ ...current, links: true }));
});

it('turns inline session mentions into links the bubble can open', () => {
  const body = withSessionMentionLinks('看 [整理发布说明](session:asg-1) 的进度');
  expect(body).toBe('看 [整理发布说明](https://session.tobs.invalid/asg-1) 的进度');
  expect(sessionMentionId('https://session.tobs.invalid/asg-1')).toBe('asg-1');
  expect(sessionMentionId('https://example.com/asg-1')).toBeUndefined();
});

it('marks Assignment Session chips with the Sessions panel icon', async () => {
  const host = await render(vi.fn());
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-session-links-toggle]')!.click(),
  );
  const icon = host.querySelector('[data-session-link="asg-1"] svg');
  const paths = [...(icon?.querySelectorAll('path') ?? [])].map((path) => path.getAttribute('d'));
  expect(paths).toEqual(['M17 5H3', 'M21 12H8', 'M21 19H8', 'M3 12v7']);
});
