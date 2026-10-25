import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import type { NavigationAction } from 'expo-router/react-navigation';
import { channelRouteId, channelStackRouter } from '../src/ui/shell/channel-navigation';

export function channelNavigationHarness() {
  const original = StackRouter({ initialRouteName: '(tabs)' }) as Parameters<
    typeof channelStackRouter
  >[0];
  const reduce = channelStackRouter(original).getStateForAction!;
  const options = {
    routeNames: [
      '(tabs)',
      'settings',
      'group/[id]',
      'bot/[slug]',
      'inbox/[id]',
      'dm/[slug]',
      'channel/[id]',
      'cloud-channels',
      'conversation-section',
      'request-activity',
      'channel-files',
    ],
    routeParamList: {},
    routeGetIdList: {
      'dm/[slug]': ({ params }: { params?: object }) => channelRouteId('dm/[slug]', { ...params }),
      'channel/[id]': ({ params }: { params?: object }) =>
        channelRouteId('channel/[id]', { ...params }),
    },
  };
  let state: Parameters<typeof reduce>[0] = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 1,
    index: 0,
    routeNames: options.routeNames,
    routes: [{ key: 'tabs', name: '(tabs)' }],
  };
  const navigation = {
    isReady: () => true,
    getRootState: () => state,
    dispatch(action: NavigationAction) {
      const next = reduce(state, action, options);
      if (next && typeof next === 'object') state = next.state;
    },
  };
  return {
    navigation,
    get state() {
      return state;
    },
    push: (name: string, params: object = {}) =>
      navigation.dispatch({ type: 'PUSH', payload: { name, params } }),
    back: () => navigation.dispatch({ type: 'GO_BACK' }),
  };
}
