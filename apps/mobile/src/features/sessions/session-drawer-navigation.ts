import { router } from 'expo-router';
import type { HostColorId } from '@botharness/host-client/ui/design/host-look';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { interfacePreferences } from '../../ui/interface-preferences';
import { lastSession, type LastSession } from './last-session';
import { closeSessionDrawer, openSessionDrawer } from './session-drawer-state';
import {
  sessionLandingStep,
  type SessionLandingStep,
  type SessionsStackView,
} from './session-landing';

type SessionTarget = Pick<HostSessionRow, 'sessionId' | 'title' | 'folderName' | 'folderLook'> & {
  source: HostSessionRow['source'] | { kind: 'bot'; botSlug: string };
};

let entered = false;

function style() {
  return interfacePreferences.getSnapshot().sessionNavigation;
}

function sessionRoute(hostId: string, row: SessionTarget, autoColor?: HostColorId) {
  return {
    pathname: '/session/[id]' as const,
    params: {
      id: row.sessionId,
      hostId,
      ...(row.source.kind === 'native' ? { source: 'native' } : { slug: row.source.botSlug }),
      ...(row.title === undefined ? {} : { title: row.title }),
      ...(row.folderName === undefined
        ? {}
        : {
            folderColorName: row.folderName,
            ...(autoColor === undefined ? {} : { folderAutoColor: autoColor }),
            ...(row.folderLook?.color === undefined
              ? {}
              : { folderLookColor: row.folderLook.color }),
          }),
    },
  };
}

export function openDrawerSession(
  hostId: string,
  row: SessionTarget,
  autoColor?: HostColorId,
): void {
  entered = true;
  closeSessionDrawer();
  if (style() === 'stacked') {
    router.dismissTo('/sessions');
    router.push(sessionRoute(hostId, row, autoColor));
    return;
  }
  router.replace(sessionRoute(hostId, row, autoColor));
}

export function openNewSession(from: 'root' | 'session' | 'anywhere' = 'anywhere'): void {
  entered = true;
  closeSessionDrawer();
  if (style() !== 'stacked') {
    router.replace('/sessions');
    return;
  }
  if (from === 'session') {
    router.replace('/new-session');
    return;
  }
  if (from === 'anywhere') router.dismissTo('/sessions');
  router.push('/new-session');
}

function lastTarget(last: LastSession): SessionTarget {
  return {
    sessionId: last.sessionId,
    source: last.slug === undefined ? { kind: 'native' } : { kind: 'bot', botSlug: last.slug },
    ...(last.title === undefined ? {} : { title: last.title }),
  };
}

export function runSessionLanding(step: SessionLandingStep): void {
  entered = true;
  switch (step.kind) {
    case 'none':
      return;
    case 'open-drawer':
      openSessionDrawer();
      return;
    case 'root':
      if (style() === 'stacked') {
        router.dismissTo('/sessions');
        return;
      }
      closeSessionDrawer(false);
      router.replace('/sessions');
      if (step.drawer) openSessionDrawer();
      return;
    case 'new':
      openNewSession();
      return;
    case 'session':
      openDrawerSession(step.session.hostId, lastTarget(step.session));
      return;
  }
}

export function landInSessionsTab(focused: boolean, stack: SessionsStackView | undefined): void {
  const prefs = interfacePreferences.getSnapshot();
  const landing = focused ? 'root' : entered ? prefs.sessionReturn : prefs.sessionLaunch;
  runSessionLanding(
    sessionLandingStep(
      prefs.sessionNavigation,
      landing,
      stack,
      landing === 'last' ? lastSession() : undefined,
    ),
  );
}

export function resetSessionsEntry(): void {
  entered = false;
}
