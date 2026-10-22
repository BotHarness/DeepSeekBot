import { Host } from '@expo/ui';
import { Image } from '@expo/ui/swift-ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { t } from '../strings';
import { composerControl, composerPrimary } from './composer-chrome';
import { voiceGesture, voiceRelease } from './dictation';

export function VoiceButton(props: {
  active: boolean;
  onStart(): void;
  onStop(): void;
  onCancel(): void;
  onHeld(held: boolean): void;
}) {
  const theme = useDesignTheme();
  const size = composerControl(theme);
  const [held, setHeld] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  const session = useRef({ startedHere: false, done: true });
  const origin = useSharedValue({ x: 0, y: 0, at: 0 });
  const decision = useSharedValue<'none' | 'cancel' | 'lock'>('none');
  const hold = useCallback((value: boolean) => {
    setHeld(value);
    latest.current.onHeld(value);
  }, []);
  const begin = useCallback(() => {
    const startedHere = !latest.current.active;
    session.current = { startedHere, done: false };
    if (startedHere) {
      latest.current.onStart();
      hold(true);
    }
  }, [hold]);
  const commitDrag = useCallback(
    (choice: 'none' | 'cancel' | 'lock') => {
      if (choice === 'none' || !session.current.startedHere || session.current.done) return;
      session.current.done = true;
      hold(false);
      if (choice === 'cancel') latest.current.onCancel();
    },
    [hold],
  );
  const finish = useCallback(
    (success: boolean, choice: 'none' | 'cancel' | 'lock', duration: number) => {
      commitDrag(choice);
      hold(false);
      if (session.current.done) return;
      session.current.done = true;
      if (!success) {
        if (session.current.startedHere) latest.current.onCancel();
      } else if (!session.current.startedHere || voiceRelease(duration) === 'stop') {
        latest.current.onStop();
      }
    },
    [commitDrag, hold],
  );
  useAnimatedReaction(
    () => decision.get(),
    (next, previous) => {
      if (next !== 'none' && next !== previous) scheduleOnRN(commitDrag, next);
    },
    [commitDrag],
  );
  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .onTouchesDown((event, manager) => {
          if (event.numberOfTouches !== 1) {
            manager.fail();
            return;
          }
          const touch = event.allTouches[0];
          if (!touch) return;
          origin.set({ x: touch.absoluteX, y: touch.absoluteY, at: Date.now() });
          decision.set('none');
          manager.activate();
        })
        .onStart(() => scheduleOnRN(begin))
        .onTouchesMove((event) => {
          if (decision.get() !== 'none') return;
          const touch = event.allTouches[0];
          if (!touch) return;
          const start = origin.get();
          if (touch.absoluteX - start.x <= -voiceGesture.cancelDrag) decision.set('cancel');
          else if (touch.absoluteY - start.y <= -voiceGesture.lockDrag) decision.set('lock');
        })
        .onTouchesUp((_event, manager) => manager.end())
        .onTouchesCancelled((_event, manager) => manager.fail())
        .onFinalize((_event, success) => {
          scheduleOnRN(finish, success, decision.get(), Date.now() - origin.get().at);
        }),
    [begin, decision, finish, origin],
  );
  const activate = () =>
    latest.current.active ? latest.current.onStop() : latest.current.onStart();
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        accessible
        accessibilityRole="button"
        accessibilityLabel={props.active ? t.stopDictation : t.dictate}
        accessibilityHint={props.active ? undefined : t.dictateHint}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') activate();
        }}
        onAccessibilityTap={activate}
        testID="composer-dictation"
        style={{
          width: size,
          height: size,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: composerPrimary(theme).fill,
        }}
      >
        <Host
          pointerEvents="none"
          colorScheme={theme.scheme}
          style={{ width: size, height: size }}
          accessibilityElementsHidden
        >
          <Image
            systemName={props.active && !held ? 'stop.fill' : 'mic.fill'}
            size={theme.type.title.line}
            color={composerPrimary(theme).ink}
          />
        </Host>
      </View>
    </GestureDetector>
  );
}
