import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { createContext, use, useCallback, useMemo, useRef } from 'react';
import { View, useWindowDimensions, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useHostSessions } from '../../host/host-session';
import { hostLooks } from '../../host/native-host-look';
import { ConversationChromeContext, type ConversationChrome } from '../chat/conversation-chrome';
import { ConversationScreen } from '../chat/conversation-screen';
import { useChatHeaderHeight } from '../chat/header-chrome';
import { shownHostName } from '../design/host-look';
import { spring } from '../design/motion';
import { useDesignTheme } from '../design/theme';
import { tobMode } from '../design/tokens';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { showActionMenu } from '../primitives/app-dialog';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { holdBack } from './back-owner';
import { leaveScreen } from './leave-screen';
import { holdTobMode } from './tob-mode';
import { closesTobMode, tobComputer, tobComputers, tobModeOffset } from './tob-mode-model';

const TobModeClose = createContext<(velocity?: number) => void>(() => undefined);

function leave(): void {
  leaveScreen(router);
}

export function TobModeFrame() {
  const theme = useDesignTheme();
  const { height } = useWindowDimensions();
  const header = useChatHeaderHeight();
  const reduced = useReducedMotion();
  const offset = useSharedValue(reduced ? 0 : -height);
  const closing = useRef(false);

  const close = useCallback(
    (velocity = 0) => {
      if (closing.current) return;
      closing.current = true;
      offset.value = withSpring(
        -height,
        { ...spring.release, velocity, overshootClamping: true },
        (finished) => {
          if (finished === true) runOnJS(leave)();
        },
      );
    },
    [offset, height],
  );

  const mount = useMounted<ViewInstance>(() => {
    const release = holdTobMode();
    offset.value = withSpring(0, { ...spring.spatial.default, overshootClamping: true });
    return release;
  }, []);

  useFocusEffect(
    useCallback(() => {
      const back = holdBack(() => {
        close();
        return true;
      });
      return () => back.remove();
    }, [close]),
  );

  const pan = Gesture.Pan()
    .activeOffsetY(-tobMode.start)
    .failOffsetX([-tobMode.horizontalFail, tobMode.horizontalFail])
    .hitSlop({ top: 0, height: header })
    .onUpdate((event) => {
      if (!reduced) offset.value = tobModeOffset(event.translationY);
    })
    .onEnd((event) => {
      if (closesTobMode(event.translationY, event.velocityY)) runOnJS(close)(event.velocityY);
      else offset.value = withSpring(0, { ...spring.release, overshootClamping: true });
    });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <TobModeClose value={close}>
      <GestureDetector gesture={pan}>
        <Animated.View
          testID="tob-mode"
          collapsable={false}
          onAccessibilityEscape={() => close()}
          style={[{ flex: 1, backgroundColor: theme.color.base }, slide]}
        >
          <View ref={mount} style={{ flex: 1 }} collapsable={false}>
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                contentStyle: { backgroundColor: theme.color.base },
              }}
            />
          </View>
        </Animated.View>
      </GestureDetector>
    </TobModeClose>
  );
}

function EnvironmentMenu({
  hostId,
  choices,
}: {
  hostId: string;
  choices: readonly { hostId: string; name: string }[];
}) {
  const t = useStrings();
  const current = choices.find((choice) => choice.hostId === hostId);
  const actions: MenuAction[] = choices.map((choice) => ({
    label: choice.name,
    icon: choice.hostId === hostId ? 'check' : 'computer',
    run: () => {
      if (choice.hostId !== hostId) router.setParams({ hostId: choice.hostId });
    },
  }));
  return (
    <ActionMenuButton
      label={t.tobMode.environment(current?.name ?? '')}
      testID="tob-mode-environment"
      actions={actions}
      onOpen={() =>
        showActionMenu(
          t.tobMode.choose,
          actions.map((action) => ({ text: action.label, icon: action.icon, onPress: action.run })),
        )
      }
    />
  );
}

export function TobModeScreen() {
  const t = useStrings();
  const close = use(TobModeClose);
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const hosts = useHostSessions();
  const host = hosts.find((entry) => entry.saved.hostId === hostId);
  const slug = host === undefined ? undefined : (tobComputer(host).tob ?? undefined);
  const eligible = new Set(tobComputers(hosts.map(tobComputer)).map((c) => c.hostId));
  const choices = JSON.stringify(
    hosts
      .filter((entry) => eligible.has(entry.saved.hostId))
      .map((entry) => ({
        hostId: entry.saved.hostId,
        name: shownHostName(hostLooks.look(entry.saved.hostId), entry.saved.hostName),
      })),
  );
  const chrome = useMemo<ConversationChrome>(() => {
    const list: { hostId: string; name: string }[] = JSON.parse(choices);
    return {
      close: () => close(),
      closeLabel: t.tobMode.close,
      ...(hostId === undefined || list.length < 2
        ? {}
        : { trailing: <EnvironmentMenu hostId={hostId} choices={list} /> }),
    };
  }, [close, t, hostId, choices]);
  return (
    <ConversationChromeContext value={chrome}>
      <ConversationScreen
        key={hostId}
        expectedHostId={hostId}
        place={{ kind: 'dm', slug }}
        focus={undefined}
      />
    </ConversationChromeContext>
  );
}
