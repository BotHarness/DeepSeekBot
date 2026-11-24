import type {
  SessionLaunchLanding,
  SessionNavigationStyle,
  SessionReturnLanding,
} from '../../ui/interface-preferences';
import type { LastSession } from './last-session';

export type SessionsStackRoute = { key?: string; name: string; params?: object | undefined };
export type SessionsStackView = { index: number; routes: readonly SessionsStackRoute[] };

export type SessionLandingStep =
  | { kind: 'none' }
  | { kind: 'open-drawer' }
  | { kind: 'root'; drawer: boolean }
  | { kind: 'new' }
  | { kind: 'session'; session: LastSession };

const ROOT = 'sessions';
const NEW = 'new-session';
const SESSION = 'session/[id]';

function sessionParams(route: SessionsStackRoute | undefined): { id?: unknown; hostId?: unknown } {
  return (route?.params ?? {}) as { id?: unknown; hostId?: unknown };
}

export function sessionLandingStep(
  style: SessionNavigationStyle,
  landing: SessionLaunchLanding | SessionReturnLanding | 'root',
  stack: SessionsStackView | undefined,
  last: LastSession | undefined,
): SessionLandingStep {
  if (landing === 'stay') return { kind: 'none' };
  const top = stack?.routes[stack.index];
  const atRoot = stack === undefined || (stack.index === 0 && top?.name === ROOT);
  if (landing === 'last') {
    if (last === undefined) return sessionLandingStep(style, 'new', stack, undefined);
    const params = sessionParams(top);
    if (top?.name === SESSION && params.id === last.sessionId && params.hostId === last.hostId)
      return { kind: 'none' };
    return { kind: 'session', session: last };
  }
  if (style === 'drawer') {
    if (landing === 'list')
      return atRoot ? { kind: 'open-drawer' } : { kind: 'root', drawer: true };
    return atRoot ? { kind: 'none' } : { kind: 'root', drawer: false };
  }
  if (landing === 'new') return top?.name === NEW ? { kind: 'none' } : { kind: 'new' };
  return atRoot ? { kind: 'none' } : { kind: 'root', drawer: false };
}

export function restackSessions(
  style: SessionNavigationStyle,
  stack: SessionsStackView,
): SessionsStackRoute[] | undefined {
  const top = stack.routes[stack.index];
  if (top === undefined) return undefined;
  if (style === 'stacked')
    return (top.name === SESSION || top.name === NEW) && stack.index === 0
      ? [{ name: ROOT }, top]
      : undefined;
  if (top.name === SESSION && stack.index > 0) return [top];
  if (top.name === NEW) {
    const root = stack.routes[0];
    return [root?.name === ROOT ? root : { name: ROOT }];
  }
  return undefined;
}
