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

async function render(open: (botSlug: string, sessionId: string, title: string) => void) {
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
