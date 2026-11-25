type NestedStack = {
  state?: { index?: number; routes: readonly { name: string; params?: object | undefined }[] };
};

export function sessionsStack(route: object) {
  const state = (route as NestedStack).state;
  if (state === undefined) return undefined;
  return {
    index: state.index ?? state.routes.length - 1,
    routes: state.routes.map((route) => ({ name: route.name, params: route.params })),
  };
}
