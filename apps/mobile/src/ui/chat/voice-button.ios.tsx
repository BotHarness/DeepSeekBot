import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import { composerControl } from './composer-chrome';
import { NativeComposerButton } from './native-composer-button.ios';

export function VoiceButton({
  active,
  onStart,
  onStop,
}: {
  active: boolean;
  onStart(): void;
  onStop(): void;
  onCancel(): void;
  onHeld(held: boolean): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <NativeComposerButton
      testID="composer-dictation"
      label={active ? t.stopDictation : t.dictate}
      symbol={active ? 'stop.fill' : 'mic.fill'}
      size={composerControl(theme)}
      filled
      onPress={active ? onStop : onStart}
    />
  );
}
