import { appStackState, type ChannelNavigation } from './channel-navigation';
import type { CloudWorkspace } from '../../cloud/workspace-directory';

export type CloudWorkspaceRoot = {
  instanceId: string;
  organizationId: string;
  accountScope: string;
  guest: 'true' | 'false';
};

export async function selectCloudWorkspace(
  navigation: ChannelNavigation,
  workspace: CloudWorkspace,
  source: { scope(instanceId: string): string; enter(workspace: CloudWorkspace): Promise<void> },
  current: () => boolean,
): Promise<boolean> {
  const accountScope = source.scope(workspace.instanceId);
  if (!current()) return false;
  await source.enter(workspace);
  if (!current() || source.scope(workspace.instanceId) !== accountScope) return false;
  return resetWorkspaceRoot(navigation, {
    instanceId: workspace.instanceId,
    organizationId: workspace.organizationId,
    accountScope,
    guest: workspace.role === 'guest' ? 'true' : 'false',
  });
}

export function resetWorkspaceRoot(
  navigation: ChannelNavigation,
  cloud?: CloudWorkspaceRoot,
): boolean {
  if (!navigation.isReady()) return false;
  const state = appStackState(navigation.getRootState());
  if (!state) return false;
  const retained = state.routes.find((route) => route.name === '(tabs)');
  const tabsState = retained?.state;
  const home = tabsState?.routes.findIndex((route) => route.name === '(home)') ?? -1;
  const tabs =
    retained && tabsState && home >= 0
      ? {
          ...retained,
          state: {
            ...tabsState,
            index: home,
            history: [{ type: 'route', key: tabsState.routes[home]?.key }],
            routes: tabsState.routes.map((route) =>
              route.state?.type === 'stack'
                ? {
                    ...route,
                    state: { ...route.state, index: 0, routes: route.state.routes.slice(0, 1) },
                  }
                : route,
            ),
          },
        }
      : (retained ?? { name: '(tabs)' });
  const existing =
    cloud &&
    state.routes.find((route) => {
      const params: Record<string, unknown> = { ...route.params };
      return (
        route.name === 'cloud-channels' &&
        !params['channelId'] &&
        params['instanceId'] === cloud.instanceId &&
        params['organizationId'] === cloud.organizationId &&
        params['accountScope'] === cloud.accountScope &&
        (params['guest'] === 'true') === (cloud.guest === 'true')
      );
    });
  navigation.dispatch({
    type: 'RESET',
    target: state.key,
    payload: {
      ...state,
      index: cloud ? 1 : 0,
      routes: cloud ? [tabs, { ...existing, name: 'cloud-channels', params: cloud }] : [tabs],
    },
  });
  return true;
}

export function removeScopedRoutes(
  navigation: ChannelNavigation,
  hostIds: ReadonlySet<string>,
  instanceIds: ReadonlySet<string>,
): void {
  if (!navigation.isReady() || (!hostIds.size && !instanceIds.size)) return;
  const state = appStackState(navigation.getRootState());
  if (!state) return;
  const routes = state.routes.filter((route) => {
    const params: Record<string, unknown> = { ...route.params };
    const hostId = params['hostId'];
    const instanceId = params['instanceId'];
    return (
      !(typeof hostId === 'string' && hostIds.has(hostId)) &&
      !(
        route.name.startsWith('cloud-') &&
        typeof instanceId === 'string' &&
        instanceIds.has(instanceId)
      )
    );
  });
  if (routes.length === state.routes.length) return;
  const active = routes.findIndex((route) => route.key === state.routes[state.index]?.key);
  navigation.dispatch({
    type: 'RESET',
    target: state.key,
    payload: {
      ...state,
      index: Math.max(0, active >= 0 ? active : routes.length - 1),
      routes: routes.length ? routes : [{ name: '(tabs)' }],
    },
  });
}
