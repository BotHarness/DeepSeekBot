import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useRef, useState, type ComponentProps } from 'react';
import { Keyboard, View, useWindowDimensions, type ViewInstance } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hostSession, useHostSession } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { useHostLook } from '../../host/native-host-look';
import { useActivityCount } from '../../host/native-activity-count';
import {
  creationTargets,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { cloudClient } from '../../cloud/native';
import { useCloudConversations } from '../../cloud/native-conversations';
import { cloudError } from '../../cloud/client';
import { ClientError } from '../../cloud/instance-contract';
import { prepareCloudCreation } from '../../cloud/prepare-creation';
import { shownHostName } from '../design/host-look';
import { useDesignTheme } from '../design/theme';
import { navigationBar, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { NavigationMaterial } from './navigation-material';
import { NavigationDestinations } from './navigation-destinations';
import { NavigationAction } from './navigation-action';
import { CreationPanel } from './creation-panel';
import { FloatingTabInset } from './floating-tab-inset';
import { ScrollChromeProvider, useChromeHidden, useChromeProgress } from './scroll-chrome';
import { retainedSearch } from '../../host/native-retained-search';
import { t } from '../strings';

type TabBarProps = ComponentProps<typeof BottomTabBar>;

export function BottomNavigation() {
  return (
    <ScrollChromeProvider>
      <NavigationLayout />
    </ScrollChromeProvider>
  );
}

function NavigationLayout() {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const size = Math.max(
    navigationBar.height,
    theme.type.title.line + theme.type.meta.line * fontScale * (fontScale > 1.3 ? 2 : 1) + space.x5,
  );
  const bottom = Math.max(insets.bottom, space.x4);
  const reserved = size + bottom + space.x5;
  return (
    <FloatingTabInset.Provider value={reserved}>
      <Tabs
        safeAreaInsets={{ bottom: 0 }}
        tabBar={(props) => (
          <NavigationBar {...props} size={size} bottom={bottom} reserved={reserved} />
        )}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.color.base } }}
      >
        <Tabs.Screen name="(home)" options={{ title: t.chats }} />
        <Tabs.Screen name="(activity)" options={{ title: t.activity }} />
        <Tabs.Screen name="(search)" options={{ title: t.localSearch.title }} />
      </Tabs>
    </FloatingTabInset.Provider>
  );
}

type NavigationBarLayout = TabBarProps & { size: number; bottom: number; reserved: number };

function NavigationBar(props: NavigationBarLayout) {
  const [scope] = useConversationFilter();
  return <ScopedNavigationBar key={scope} {...props} scope={scope} />;
}

function ScopedNavigationBar({
  state,
  emitter,
  navigateToTab,
  size,
  bottom,
  reserved,
  scope,
}: NavigationBarLayout & { scope: string }) {
  const { saved } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const directory = useCloudConversations();
  const targets = creationTargets(
    saved ? { hostId: saved.hostId, name: shownHostName(look, saved.hostName) } : undefined,
    directory.workspaces,
  );
  const pending = useActivityCount().count ?? 0;
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const close = () => {
    generation.current++;
    setMenu(undefined);
    setError(undefined);
  };
  const mount = useMounted<ViewInstance>(
    () => () => {
      generation.current++;
    },
    [],
  );
  const hidden = useChromeHidden();
  const progress = useChromeProgress();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: reserved * progress.value }],
    opacity: 1 - progress.value,
  }));
  const choose = async (action: CreationAction, target?: CreationTarget) => {
    if (busy) return;
    const version = generation.current;
    if (action === 'join') {
      close();
      router.push('/cloud-join');
      return;
    }
    if (!target) return;
    setBusy(true);
    setError(undefined);
    try {
      if (target.kind === 'computer') {
        if (hostSession.getState().saved?.hostId !== target.hostId)
          throw new ClientError('SOURCE_CHANGED');
        if (action !== 'bot' && action !== 'channel') return;
        close();
        router.push({
          pathname: '/full-client',
          params: { target: action === 'bot' ? 'new-bot' : 'new-channel', hostId: target.hostId },
        });
      } else {
        await prepareCloudCreation(cloudClient, target.workspace);
        if (version !== generation.current) return;
        close();
        router.push({
          pathname: action === 'invite' ? '/cloud-invitations' : '/cloud-create-channel',
          params: {
            instanceId: target.workspace.instanceId,
            organizationId: target.workspace.organizationId,
            accountScope: target.workspace.scope,
          },
        });
      }
    } catch (e) {
      if (version === generation.current) setError(cloudError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Animated.View
        ref={mount}
        pointerEvents={hidden ? 'none' : 'box-none'}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        style={[
          {
            position: 'absolute',
            left: insets.left + space.x5,
            right: insets.right + space.x5,
            bottom,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: space.x3,
          },
          style,
        ]}
      >
        <View
          style={{
            flex: 1,
            height: size,
            flexDirection: 'row',
            padding: space.x2,
            borderRadius: radius.round,
          }}
        >
          <NavigationMaterial />
          <NavigationDestinations
            items={state.routes.map((route, index) => ({
              key: route.key,
              focused: state.index === index,
              activity: route.name === '(activity)',
              search: route.name === '(search)',
              count: route.name === '(activity)' ? pending : 0,
              onPress: () => {
                const event = emitter.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (state.index !== index && !event.defaultPrevented) {
                  if (route.name === '(search)') retainedSearch.enter(scope);
                  navigateToTab(route.key);
                }
              },
              onLongPress: () => emitter.emit({ type: 'tabLongPress', target: route.key }),
            }))}
          />
        </View>
        {state.routes[state.index]?.name !== '(search)' && (
          <NavigationAction
            size={navigationBar.height}
            label={t.createHere}
            onPress={() => {
              Keyboard.dismiss();
              setError(undefined);
              setMenu(scope);
            }}
          />
        )}
      </Animated.View>
      {menu === scope && (
        <CreationPanel
          key={scope}
          scope={scope}
          targets={targets}
          size={navigationBar.height}
          bottom={bottom}
          onClose={close}
          onPick={(action, target) => void choose(action, target)}
          busy={busy}
          error={error}
        />
      )}
    </>
  );
}
