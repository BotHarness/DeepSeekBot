import { useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { MicIcon, RecordingStopIcon } from '../shell/icons';
import { t } from '../strings';
import { composerControl, composerPrimary, micAlwaysFilled } from './composer-chrome';
import { voiceDrag, voiceRelease } from './dictation';

export function VoiceButton({
  active,
  onStart,
  onStop,
  onCancel,
  onHeld,
}: {
  active: boolean;
  onStart(): void;
  onStop(): void;
  onCancel(): void;
  onHeld(held: boolean): void;
}) {
  const theme = useDesignTheme();
  const [held, setHeld] = useState(false);
  const size = composerControl(theme);
  const latest = useRef({ active, onStart, onStop, onCancel, onHeld });
  latest.current = { active, onStart, onStop, onCancel, onHeld };
  const gesture = useRef({ at: 0, startedHere: false, done: false });
  const hold = (next: boolean) => {
    setHeld(next);
    latest.current.onHeld(next);
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const startedHere = !latest.current.active;
        gesture.current = { at: Date.now(), startedHere, done: false };
        if (!startedHere) return;
        latest.current.onStart();
        hold(true);
      },
      onPanResponderMove: (_event, { dx, dy }) => {
        const current = gesture.current;
        if (!current.startedHere || current.done) return;
        const drag = voiceDrag(dx, dy);
        if (drag === undefined) return;
        current.done = true;
        hold(false);
        if (drag === 'cancel') latest.current.onCancel();
      },
      onPanResponderRelease: () => {
        const current = gesture.current;
        hold(false);
        if (current.done) return;
        if (!current.startedHere) latest.current.onStop();
        else if (voiceRelease(Date.now() - current.at) === 'stop') latest.current.onStop();
      },
      onPanResponderTerminate: () => hold(false),
    }),
  ).current;
  const filled = micAlwaysFilled || active || held;
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={active ? t.stopDictation : t.dictate}
      accessibilityHint={active ? undefined : t.dictateHint}
      onAccessibilityTap={() => (latest.current.active ? onStop() : onStart())}
      hitSlop={space.x2}
      style={{
        width: size,
        height: size,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? composerPrimary(theme).fill : undefined,
      }}
    >
      {active && !held ? (
        <RecordingStopIcon color={composerPrimary(theme).ink} size={theme.type.title.line} />
      ) : (
        <MicIcon
          color={filled ? composerPrimary(theme).ink : theme.color.muted}
          size={theme.type.title.line}
        />
      )}
    </View>
  );
}
