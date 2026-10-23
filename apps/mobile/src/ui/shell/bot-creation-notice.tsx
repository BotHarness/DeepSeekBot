import { router, usePathname } from 'expo-router';
import { useRef } from 'react';
import { AppState, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { botCreation, useBotCreation } from '../../host/native-bot-creation';
import { hostSession } from '../../host/host-session';
import { createCreationVisibility } from '../../host/bot-creation-visibility';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { creationCopy as copy } from './bot-creation-copy';
import { openCreatedBot } from './open-created-bot';
import { useMounted } from '../mounted';

export function BotCreationNotice() {
  const state = useBotCreation();
  const path = usePathname();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardState((state) => state.isVisible);
  const visibility = useRef(createCreationVisibility(AppState.currentState === 'active')).current;
  const mounted = useMounted<ViewInstance>(() => {
    visibility.focus();
    const recover = () => {
      const current = botCreation.getSnapshot();
      if (
        AppState.currentState !== 'active' ||
        !current.loaded ||
        current.busy ||
        hostSession.getState().saved === undefined ||
        current.record.kind !== 'submitted' ||
        current.receipt?.status === 'created'
      )
        return;
      if (current.error && current.error !== 'unreachable' && current.error !== 'invalid-receipt')
        return;
      void botCreation.resume();
    };
    recover();
    let live = true;
    void botCreation.ready.then(() => {
      if (live) recover();
    });
    const offHost = hostSession.subscribe(recover);
    const off = AppState.addEventListener('change', (state) => {
      visibility.appState(state === 'active');
      recover();
    });
    const timer = setInterval(recover, 10_000);
    return () => {
      live = false;
      visibility.blur();
      offHost();
      off.remove();
      clearInterval(timer);
    };
  }, [path, visibility]);
  const hidden =
    !state.loaded ||
    keyboardOpen ||
    path === '/create-bot' ||
    (state.record.kind === 'submitted' && state.record.acknowledged) ||
    (state.record.kind === 'draft' &&
      !state.record.draft.displayName &&
      !state.record.draft.persona) ||
    (state.receipt?.status === 'created' && path === `/dm/${state.receipt.botSlug}`);
  return (
    <View ref={mounted} style={{ flexShrink: 0 }}>
      {!hidden ? (
        <View
          testID="create-bot-notice"
          style={{
            flexShrink: 0,
            paddingLeft: insets.left + space.x5,
            paddingRight: insets.right + space.x5,
            paddingTop: space.x2,
            paddingBottom: insets.bottom + space.x2,
          }}
        >
          <View
            accessibilityLiveRegion="polite"
            style={{
              gap: space.x2,
              padding: space.x3,
              borderRadius: radius.lg,
              backgroundColor: theme.layer.raised.fill,
            }}
          >
            {state.receipt?.status === 'created' ? <Text strong>{copy.completed}</Text> : null}
            <Button
              label={state.receipt?.status === 'created' ? copy.open : copy.resume}
              testID="create-bot-resume"
              onPress={() => {
                const stillHere = visibility.lease();
                if (state.receipt?.status === 'created')
                  void openCreatedBot(stillHere).then((opened) => {
                    if (!opened && stillHere()) router.push('/create-bot');
                  });
                else router.push('/create-bot');
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
