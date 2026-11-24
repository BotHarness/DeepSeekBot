import { describe, expect, it } from 'vitest';
import {
  restackSessions,
  sessionLandingStep,
  type SessionsStackView,
} from '../src/features/sessions/session-landing';

const root: SessionsStackView = { index: 0, routes: [{ name: 'sessions' }] };
const session = (id: string, index = 0): SessionsStackView => ({
  index,
  routes: [
    ...(index > 0 ? [{ name: 'sessions' }] : []),
    { key: `s-${id}`, name: 'session/[id]', params: { id, hostId: 'studio' } },
  ],
});
const last = { hostId: 'studio', sessionId: 'native-1', title: 'Map the repository' };

describe('Sessions tab landing', () => {
  it('stays where it was by default when returning', () => {
    expect(sessionLandingStep('drawer', 'stay', session('a'), last)).toEqual({ kind: 'none' });
    expect(sessionLandingStep('stacked', 'stay', session('a', 1), last)).toEqual({ kind: 'none' });
  });

  it('treats Drawer-style “Session list” as New Session with the drawer open', () => {
    expect(sessionLandingStep('drawer', 'list', root, undefined)).toEqual({ kind: 'open-drawer' });
    expect(sessionLandingStep('drawer', 'list', session('a'), undefined)).toEqual({
      kind: 'root',
      drawer: true,
    });
    expect(sessionLandingStep('drawer', 'list', undefined, undefined)).toEqual({
      kind: 'open-drawer',
    });
  });

  it('goes to the New Session screen in each style', () => {
    expect(sessionLandingStep('drawer', 'new', root, undefined)).toEqual({ kind: 'none' });
    expect(sessionLandingStep('drawer', 'new', session('a'), undefined)).toEqual({
      kind: 'root',
      drawer: false,
    });
    expect(sessionLandingStep('stacked', 'new', root, undefined)).toEqual({ kind: 'new' });
    expect(
      sessionLandingStep(
        'stacked',
        'new',
        { index: 1, routes: [{ name: 'sessions' }, { name: 'new-session' }] },
        undefined,
      ),
    ).toEqual({ kind: 'none' });
  });

  it('goes to the Session list root in Stacked style, and re-tapping the tab goes to the root', () => {
    expect(sessionLandingStep('stacked', 'list', root, undefined)).toEqual({ kind: 'none' });
    expect(sessionLandingStep('stacked', 'list', session('a', 1), undefined)).toEqual({
      kind: 'root',
      drawer: false,
    });
    expect(sessionLandingStep('stacked', 'root', session('a', 1), undefined)).toEqual({
      kind: 'root',
      drawer: false,
    });
    expect(sessionLandingStep('drawer', 'root', session('a'), undefined)).toEqual({
      kind: 'root',
      drawer: false,
    });
    expect(sessionLandingStep('drawer', 'root', root, undefined)).toEqual({ kind: 'none' });
  });

  it('opens the last Session unless it is already open, falling back to New Session', () => {
    expect(sessionLandingStep('drawer', 'last', root, last)).toEqual({
      kind: 'session',
      session: last,
    });
    expect(sessionLandingStep('stacked', 'last', session('native-1', 1), last)).toEqual({
      kind: 'none',
    });
    expect(sessionLandingStep('stacked', 'last', root, undefined)).toEqual({ kind: 'new' });
    expect(sessionLandingStep('drawer', 'last', root, undefined)).toEqual({ kind: 'none' });
  });
});

describe('switching the Session navigation style', () => {
  it('puts the Session list under the open Session for Stacked style', () => {
    const open = session('a');
    expect(restackSessions('stacked', open)).toEqual([{ name: 'sessions' }, open.routes[0]]);
    expect(restackSessions('stacked', session('a', 1))).toBeUndefined();
    expect(restackSessions('stacked', root)).toBeUndefined();
  });

  it('makes the open Session the root for Drawer style and drops a pushed New Session', () => {
    const open = session('a', 1);
    expect(restackSessions('drawer', open)).toEqual([open.routes[1]]);
    expect(restackSessions('drawer', session('a'))).toBeUndefined();
    const listRoot = { key: 'root-1', name: 'sessions' };
    expect(
      restackSessions('drawer', { index: 1, routes: [listRoot, { name: 'new-session' }] }),
    ).toEqual([listRoot]);
  });
});
