import { memo } from 'react';
import { View } from 'react-native';

import type { ChannelVoiceCallRecord } from '../../../../../packages/core/src/channels/voice-call-record';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { CameraIcon, PhoneIcon, PhoneOffIcon, ScreenIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { callRecordLines } from './call-record-text';

export const CallRecordBubble = memo(function CallRecordBubble({
  record,
}: {
  record: ChannelVoiceCallRecord;
}) {
  const strings = useStrings();
  const theme = useDesignTheme();
  const { title, detail } = callRecordLines(record, strings.call);
  const started = record.state === 'started';
  const glyph = theme.type.body.line;
  const Icon =
    record.state === 'frames' || record.state === 'share-stopped'
      ? record.source === 'camera'
        ? CameraIcon
        : ScreenIcon
      : started
        ? PhoneIcon
        : PhoneOffIcon;
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.x2 }}>
      <View
        testID={`call-record-${record.state}`}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}, ${detail}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          maxWidth: '86%',
          paddingVertical: space.x2,
          paddingLeft: space.x2,
          paddingRight: space.x5,
          borderRadius: radius.lg,
          borderWidth: edge.hairline,
          borderColor: theme.layer.raised.edge,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <View
          style={{
            width: glyph + space.x4,
            height: glyph + space.x4,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.layer.raised.inset,
          }}
        >
          <Icon color={started ? theme.color.success : theme.color.muted} size={glyph} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text variant="body" strong numberOfLines={theme.largeText ? undefined : 1}>
            {title}
          </Text>
          <Text variant="meta" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {detail}
          </Text>
        </View>
      </View>
    </View>
  );
});
