import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseActivitySnapshot } from '../src/client/activity-live.js';
import { createStore, type BotSummary } from '../src/client/store.js';
import { PersonaBotAvatar, personaBotActivitySummary } from '../src/client/avatar.js';
import { zhTranslate } from '../src/client/locale.js';
const activity = {
  effect: 'executing' as const,
  toolKind: 'execute' as const,
  toolName: 'shell',
  startedAt: 1000,
  activeToolCount: 1,
};
const bot: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-10-01',
};
describe('revisioned safe tool presentation', () => {
  it('allowlists the Host DTO and retains current detail over stale roster replies; idle clears it', () => {
    const snapshot = parseActivitySnapshot(
      JSON.stringify({
        generation: 'host',
        revision: 2,
        bots: [{ slug: 'ada', state: 'working', activity: { ...activity, arguments: 'private' } }],
      }),
    );
    expect(snapshot?.bots[0]?.activity).toEqual(activity);
    const store = createStore({ smoothActivity: false });
    store.setRoster([bot], []);
    store.applyActivity(snapshot!);
    store.setRoster([bot], []);
    expect(store.getSnapshot().bots[0]?.activity).toEqual(activity);
    store.applyActivity({
      generation: 'host',
      revision: 1,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots[0]?.activity).toEqual(activity);
    store.applyActivity({
      generation: 'host',
      revision: 3,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots[0]?.activity).toBeUndefined();
  });
  it.each([
    { ...activity, effect: 'future' },
    { ...activity, toolKind: 'future' },
    { ...activity, toolName: 'unsafe\nname' },
    { ...activity, activeToolCount: 0 },
    { ...activity, startedAt: -1 },
  ])('rejects invalid tool metadata', (detail) => {
    expect(
      parseActivitySnapshot(
        JSON.stringify({
          generation: 'host',
          revision: 2,
          bots: [{ slug: 'ada', state: 'working', activity: detail }],
        }),
      ),
    ).toBeUndefined();
  });
  it.each([
    [{ role: 'future', count: 1 }],
    [{ role: 'assignment', count: 0 }],
    [{ role: 'assignment', count: 0.5 }],
    [{ role: 'assignment', count: 2 }],
    [
      { role: 'assignment', count: 1 },
      { role: 'assignment', count: 1 },
    ],
    [],
  ])('rejects invalid, duplicate or impossible execution source counts: %j', (...sources) => {
    expect(
      parseActivitySnapshot(
        JSON.stringify({
          generation: 'host',
          revision: 3,
          bots: [{ slug: 'ada', state: 'working', activity: { ...activity, sources } }],
        }),
      ),
    ).toBeUndefined();
  });
  it('allowlists source counts and presents the same roles in the avatar and summary', () => {
    const sources = [{ role: 'assignment' as const, count: 1 }];
    const snapshot = parseActivitySnapshot(
      JSON.stringify({
        generation: 'host',
        revision: 3,
        bots: [
          {
            slug: 'ada',
            state: 'working',
            activity: {
              ...activity,
              sources: [{ ...sources[0], arguments: 'private', sessionId: 'private' }],
            },
          },
        ],
      }),
    );
    expect(snapshot?.bots[0]?.activity?.sources).toEqual(sources);
    const detail = snapshot!.bots[0]!.activity!;
    expect(personaBotActivitySummary('working', detail, zhTranslate)).toBe(
      '正在执行 · shell · 任务会话',
    );
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state: 'working',
        activity: detail,
        t: zhTranslate,
      }),
    );
    expect(markup).toContain('正在执行 · shell · 任务会话');
    expect(markup).not.toContain('private');
    expect(personaBotActivitySummary('idle', detail, zhTranslate)).toBe('空闲');
  });
  it('renders matching safe text and effect; idle does not retain an old tool label', () => {
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state: 'working',
        activity,
        t: zhTranslate,
      }),
    );
    expect(markup).toContain('data-effect="executing"');
    expect(markup).toContain('正在执行 · shell');
    expect(personaBotActivitySummary('idle', activity, zhTranslate)).toBe('空闲');
  });
});

describe('Provider-declared public detail presentation', () => {
  it('retains only bounded public text and uses the shared avatar/sidebar summary', () => {
    const detail = {
      ...activity,
      publicDetail: '<b>Opening a browser tab</b>',
      arguments: 'private',
    };
    const snapshot = parseActivitySnapshot(
      JSON.stringify({
        generation: 'host',
        revision: 1,
        bots: [{ slug: 'ada', state: 'working', activity: detail }],
      }),
    );
    const projected = snapshot?.bots[0]?.activity;
    expect(projected).toEqual({ ...activity, publicDetail: detail.publicDetail });
    expect(personaBotActivitySummary('working', projected)).toContain(detail.publicDetail);
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 28,
        state: 'working',
        activity: projected,
      }),
    );
    expect(markup).toContain('&lt;b&gt;Opening a browser tab&lt;/b&gt;');
    expect(markup).not.toContain('private');
  });
  it.each(['', 'x'.repeat(161), 'line\nbreak', '\u202Ehidden', { secret: 'private' }])(
    'rejects invalid transported public detail %j',
    (publicDetail) => {
      expect(
        parseActivitySnapshot(
          JSON.stringify({
            generation: 'host',
            revision: 1,
            bots: [{ slug: 'ada', state: 'working', activity: { ...activity, publicDetail } }],
          }),
        ),
      ).toBeUndefined();
    },
  );
});
