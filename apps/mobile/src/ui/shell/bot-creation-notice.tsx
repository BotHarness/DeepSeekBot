import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { botCreation, useBotCreation } from '../../host/native-bot-creation';
import { useHostSession } from '../../host/host-session';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { creationCopy as copy } from './bot-creation-copy';
import { openCreatedBot } from './open-created-bot';

export function BotCreationNotice() {
  const state = useBotCreation();
  const session = useHostSession();
  const path = usePathname();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const recover = () => {
      const current = botCreation.getSnapshot();
      if (
        AppState.currentState !== 'active' ||
        !current.loaded ||
        current.busy ||
        session.saved === undefined ||
        current.record.kind !== 'submitted' ||
        current.receipt?.status === 'created'
      )
        return;
      if (current.error && current.error !== 'unreachable' && current.error !== 'invalid-receipt')
        return;
      void botCreation.resume();
    };
    recover();
    const off = AppState.addEventListener('change', recover);
    const timer = setInterval(recover, 10_000);
    return () => {
      off.remove();
      clearInterval(timer);
    };
  }, [state.loaded, session.saved]);
  if (
    !state.loaded ||
    path === '/create-bot' ||
    (state.record.kind === 'submitted' && state.record.acknowledged) ||
    (state.record.kind === 'draft' &&
      !state.record.draft.displayName &&
      !state.record.draft.persona) ||
    (state.receipt?.status === 'created' && path === `/dm/${state.receipt.botSlug}`)
  )
    return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: space.x5,
        right: space.x5,
        bottom: insets.bottom + theme.touch * 2 + space.x5,
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
            if (state.receipt?.status === 'created')
              void openCreatedBot().then((opened) => {
                if (!opened) router.push('/create-bot');
              });
            else router.push('/create-bot');
          }}
        />
      </View>
    </View>
  );
}
