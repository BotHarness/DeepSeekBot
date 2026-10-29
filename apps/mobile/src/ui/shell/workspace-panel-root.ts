type StackRoute = { key?: string; name: string };
type ChatsStack<R extends StackRoute> = { index?: number; routes: readonly R[] };

export function workspaceStackRoot<R extends StackRoute, S extends ChatsStack<R>>(
  state: S,
): Omit<S, 'routes' | 'index'> & { index: number; routes: R[] } {
  return { ...state, index: 0, routes: state.routes.slice(0, 1) };
}
