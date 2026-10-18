// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/shell/icons', () => ({
  ChevronLeftIcon: () => null,
  ChevronRightIcon: () => null,
}));

import type { RosterBot } from '../src/host/client';
import { shiftDay } from '../src/host/usage-days';
import type { ProfileActivity } from '../src/host/wire';
import { ActivityDetailView, type ActivityQuery } from '../src/ui/chat/activity-detail';
import { heatLevel, heatWeeks } from '../src/ui/primitives/day-heat';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const bot: RosterBot = {
  slug: 'bot-1',
  displayName: 'Activity Probe',
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
};

const TODAY = '2026-10-15';

function answer(query: ActivityQuery): ProfileActivity {
  const last = query.before === undefined ? TODAY : shiftDay(query.before, -1);
  return {
    weeks: query.weeks,
    ...(query.before === undefined ? {} : { before: query.before }),
    today: TODAY,
    events: [{ day: last, reason: 'group-mention', count: query.weeks }],
    memoryCommits: [{ day: last, count: 2 }],
    tokens: [
      { day: last, inputTokens: 600, outputTokens: 200, cacheReadTokens: 200, cacheWriteTokens: 0 },
    ],
    modelUsageRows: [
      {
        day: last,
        purpose: 'orchestrator',
        provider: 'opencode-go',
        model: 'deepseek-v4',
        inputTokens: 600,
        outputTokens: 200,
        cacheReadTokens: query.weeks === 4 ? null : 200,
        cacheWriteTokens: 0,
        totalTokens: 1000 * query.weeks,
      },
    ],
    modelUsageStatus: 'ready',
  };
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

describe('Bot Activity screen', () => {
  it('lays Memory commits out in Monday weeks and shades them by count', () => {
    expect(heatWeeks('2026-10-09', '2026-10-15').map((week) => [week[0], week[6]])).toEqual([
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', '2026-10-18'],
    ]);
    expect([0, 1, 2, 3, 6, 11, 40].map(heatLevel)).toEqual([0, 1, 1, 2, 3, 4, 4]);
  });

  it('opens on the last 7 days with the token split, models, reasons and Memory commits', async () => {
    const load = vi.fn(async (query: ActivityQuery) => answer(query));
    const view = await render(<ActivityDetailView bot={bot} load={load} />);

    expect(load).toHaveBeenCalledWith({ weeks: 1 });
    const text = view.textContent ?? '';
    expect(text).toContain(t.activityTokens((1000).toLocaleString()));
    expect(text).toContain(t.activityShares(25, 20));
    expect(text).toContain('deepseek-v4');
    expect(text).toContain(t.activityReason['group-mention']);
    expect(text).toContain(t.activityCount(2));
    expect(text).not.toContain(t.usagePartial);
    expect(button(view, t.activityLater).disabled).toBe(true);
    expect(button(view, t.activityWindow[1]!).getAttribute('aria-selected')).toBe('true');
  });

  it('refetches when the window changes and pages back by a whole window', async () => {
    const load = vi.fn(async (query: ActivityQuery) => answer(query));
    const view = await render(<ActivityDetailView bot={bot} load={load} />);

    await act(async () => button(view, t.activityWindow[4]!).click());
    await act(async () => undefined);
    expect(load).toHaveBeenLastCalledWith({ weeks: 4 });
    expect(view.textContent).toContain(t.activityTokens('4,000'));
    expect(view.textContent).toContain(t.usagePartial);

    await act(async () => button(view, t.activityEarlier).click());
    await act(async () => undefined);
    expect(load).toHaveBeenLastCalledWith({ weeks: 4, before: '2026-09-18' });
    expect(button(view, t.activityLater).disabled).toBe(false);

    await act(async () => button(view, t.activityLater).click());
    await act(async () => undefined);
    expect(load).toHaveBeenLastCalledWith({ weeks: 4 });
  });

  it('says so and offers Try again when the call fails', async () => {
    let attempt = 0;
    const view = await render(
      <ActivityDetailView
        bot={bot}
        load={async (query) => {
          if ((attempt += 1) === 1) throw new Error('The Host did not answer in time.');
          return answer(query);
        }}
      />,
    );
    expect(view.textContent).toContain(`${t.profileFailed} The Host did not answer in time.`);
    await act(async () => button(view, t.tryAgain).click());
    await act(async () => undefined);
    expect(view.textContent).toContain('deepseek-v4');
  });
});
