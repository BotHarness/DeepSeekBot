export const WORKSPACE_PANEL_ROUTE = 'workspaces';
export const CHATS_ROUTE = 'index';

export function usesWorkspacePanel(os: string): boolean {
  return os === 'ios';
}

type StackRoute = { key?: string; name: string };
type ChatsStack<R extends StackRoute> = { index?: number; routes: readonly R[] };

let sequence = 0;

function chatsRoute(): { key: string; name: string } {
  return { key: `${CHATS_ROUTE}-panel-${++sequence}`, name: CHATS_ROUTE };
}

export function hasWorkspacePanel(state: ChatsStack<StackRoute>): boolean {
  return state.routes[0]?.name === WORKSPACE_PANEL_ROUTE;
}

export function withWorkspacePanel<R extends StackRoute, S extends ChatsStack<R>>(
  state: S,
): (Omit<S, 'routes' | 'index'> & { index: number; routes: (R | StackRoute)[] }) | undefined {
  if (hasWorkspacePanel(state) || state.routes[0]?.name !== CHATS_ROUTE) return undefined;
  return {
    ...state,
    index: (state.index ?? state.routes.length - 1) + 1,
    routes: [
      { key: `${WORKSPACE_PANEL_ROUTE}-root`, name: WORKSPACE_PANEL_ROUTE },
      ...state.routes,
    ],
  };
}

export function workspaceStackRoot<R extends StackRoute, S extends ChatsStack<R>>(
  state: S,
): Omit<S, 'routes' | 'index'> & { index: number; routes: (R | StackRoute)[] } {
  const [root, next] = state.routes;
  if (!root || !hasWorkspacePanel(state))
    return { ...state, index: 0, routes: state.routes.slice(0, 1) };
  return { ...state, index: 1, routes: [root, next?.name === CHATS_ROUTE ? next : chatsRoute()] };
}

type TabRoute = { name: string; state?: { index?: number; routes: readonly StackRoute[] } };

export function showsWorkspacePanel(
  os: string,
  tabs: { index: number; routes: readonly TabRoute[] },
): boolean {
  if (!usesWorkspacePanel(os)) return false;
  const stack = tabs.routes[tabs.index]?.state;
  if (!stack) return false;
  return stack.routes[stack.index ?? stack.routes.length - 1]?.name === WORKSPACE_PANEL_ROUTE;
}
