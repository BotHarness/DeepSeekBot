// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ReceptionStatus } from '../src/client/reception-status.js';
import { zhTranslate, en, type BotHarnessTranslate } from '../src/client/locale.js';

const english = new Map(Object.entries(en));
const enTranslate: BotHarnessTranslate = (key) => english.get(key) ?? key;

it('distinguishes a connected app from reception that is retrying', () => {
  const html = renderToStaticMarkup(
    createElement(ReceptionStatus, {
      reception: 'unavailable',
      recovery: {
        kind: 'retrying',
        reason: 'provider-unavailable',
        attempt: 4,
        nextRetryAt: '2026-11-15T10:00:30Z',
      },
      t: zhTranslate,
    }),
  );
  expect(html).toContain('正在重连');
  expect(html).toContain('下次重试');
  const element = document.createElement('div');
  element.innerHTML = html;
  expect(element.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-15T10:00:30Z');
  expect(html).not.toContain('unavailable');
});

it('shows actionable failure rather than a raw refusal code, in both maintained languages', () => {
  for (const [t, expected] of [
    [zhTranslate, '需要处理'],
    [enTranslate, 'Needs attention'],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(ReceptionStatus, {
        reception: 'unavailable',
        recovery: { kind: 'action-required', reason: 'rebind-required' },
        t,
      }),
    );
    expect(html).toContain(expected);
    expect(html).not.toContain('rebind-required');
  }
});

it('shows receiving and disabled states independently from Bot activity', () => {
  expect(
    renderToStaticMarkup(
      createElement(ReceptionStatus, { reception: 'receiving', t: enTranslate }),
    ),
  ).toContain('Receiving');
  expect(
    renderToStaticMarkup(createElement(ReceptionStatus, { reception: 'off', t: zhTranslate })),
  ).toContain('已停用');
});

it('points unsupported connectors to their version and permissions rather than repeated reconnects', () => {
  const html = renderToStaticMarkup(
    createElement(ReceptionStatus, {
      reception: 'unavailable',
      recovery: { kind: 'action-required', reason: 'provider-incompatible' },
      t: enTranslate,
    }),
  );
  expect(html).toContain('connector version and receive permissions');
  expect(html).not.toContain('Reconnect and try again');
});

it('does not present unchecked saved reception as verified receiving', () => {
  const html = renderToStaticMarkup(
    createElement(ReceptionStatus, { reception: 'receiving', checking: true, t: enTranslate }),
  );
  expect(html).toContain('Checking');
  expect(html).not.toContain('Receiving');
});
