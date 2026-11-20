import { View } from 'react-native';

import { CALL_VOICE_VOLUME_MAX } from '../../host/call-audio-route';
import { space } from '../design/tokens';
import { PercentageSlider } from '../primitives/percentage-slider';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { Sheet } from './sheet';

export function CallVoiceVolumeSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: number;
  onChange(value: number): void;
  onClose(): void;
}) {
  const t = useStrings();
  const percent = Math.round(value * 100);
  return (
    <Sheet
      visible={visible}
      label={t.call.voiceVolume}
      title={t.call.voiceVolume}
      onClose={onClose}
    >
      <View testID="call-voice-volume" style={{ gap: space.x2, paddingHorizontal: space.x5 }}>
        <Text>{`${t.call.voiceVolume} · ${t.call.voiceVolumeValue(percent)}`}</Text>
        <PercentageSlider
          label={t.call.voiceVolume}
          value={percent}
          max={CALL_VOICE_VOLUME_MAX * 100}
          step={5}
          onChange={(next) => onChange(next / 100)}
        />
        <Text variant="meta" tone="muted">
          {t.call.voiceVolumeHint}
        </Text>
      </View>
    </Sheet>
  );
}
