import type { ChannelNavigation } from './channel-navigation';

export type CloudChannelTarget = {
  instanceId: string;
  accountScope: string;
  organizationId: string;
  guest: boolean;
  channelId?: string;
};

function paramsOf(target: CloudChannelTarget) {
  return {
    instanceId: target.instanceId,
    accountScope: target.accountScope,
    organizationId: target.organizationId,
    guest: String(target.guest),
    ...(target.channelId ? { channelId: target.channelId } : {}),
  };
}

export function cloudChannelRouteId(_name: string, params: Record<string, unknown>): string {
  return JSON.stringify([
    params['instanceId'],
    params['accountScope'],
    params['organizationId'] ?? '',
    params['guest'] === 'true',
    params['channelId'] ?? null,
  ]);
}

export function navigateCloudChannel(
  navigation: ChannelNavigation,
  target: CloudChannelTarget,
): boolean {
  if (!navigation.isReady()) return false;
  navigation.dispatch({
    type: 'NAVIGATE',
    target: navigation.getRootState().key,
    payload: { name: 'cloud-channels', params: paramsOf(target), pop: true },
  });
  return true;
}

export function ensureCloudChannelParent(
  navigation: ChannelNavigation,
  target: CloudChannelTarget,
): void {
  if (!navigation.isReady()) return;
  const state = navigation.getRootState();
  const current = state.routes[state.index];
  const currentParams: Record<string, unknown> = { ...current?.params };
  if (
    current?.name !== 'cloud-channels' ||
    currentParams['channelId'] !== target.channelId ||
    currentParams['instanceId'] !== target.instanceId ||
    (currentParams['organizationId'] ?? '') !== target.organizationId ||
    (currentParams['guest'] === 'true') !== target.guest ||
    (currentParams['accountScope'] !== undefined &&
      currentParams['accountScope'] !== target.accountScope)
  )
    return;
  const detail = { ...current, params: { ...current.params, ...paramsOf(target) } };
  if (!target.channelId) {
    if (currentParams['accountScope'] === target.accountScope) return;
    const routes = [...state.routes];
    routes[state.index] = detail;
    navigation.dispatch({ type: 'RESET', target: state.key, payload: { ...state, routes } });
    return;
  }
  const parentParams = paramsOf({
    instanceId: target.instanceId,
    accountScope: target.accountScope,
    organizationId: target.organizationId,
    guest: target.guest,
  });
  const parentId = cloudChannelRouteId('cloud-channels', parentParams);
  const hasParent = state.routes
    .slice(0, state.index)
    .some(
      (route) =>
        route.name === 'cloud-channels' &&
        cloudChannelRouteId(route.name, { ...route.params }) === parentId,
    );
  if (hasParent && currentParams['accountScope'] === target.accountScope) return;
  const routes = [...state.routes];
  routes[state.index] = detail;
  if (!hasParent)
    routes.splice(state.index, 0, {
      name: 'cloud-channels',
      key: `cloud-list:${parentId}`,
      params: parentParams,
    });
  navigation.dispatch({
    type: 'RESET',
    target: state.key,
    payload: { ...state, routes, index: state.index + (hasParent ? 0 : 1) },
  });
}
