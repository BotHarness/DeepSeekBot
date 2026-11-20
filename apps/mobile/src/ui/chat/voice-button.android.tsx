import { useDesignTheme } from '../design/theme';
import { MicIcon, RecordingStopIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { ComposerActionButton } from './composer-action';
import { composerPrimary } from './composer-chrome';

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
  const theme = useDesignTheme();
  const t = useStrings();
  const Icon = active ? RecordingStopIcon : MicIcon;
  return (
    <ComposerActionButton
      testID="composer-dictation"
      label={active ? t.stopDictation : t.dictate}
      symbol={active ? 'stop.fill' : 'mic.fill'}
      filled
      onPress={active ? onStop : onStart}
    >
      <Icon color={composerPrimary(theme).ink} size={theme.type.title.line} />
    </ComposerActionButton>
  );
}
