import { memo } from 'react';
import { View } from 'react-native';
import type { SessionTranscriptItem } from '@botharness/host-client/session-detail';
import type { TurnTargetCatalog } from '@botharness/host-client/turn-target';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { StepMark } from './assignment-marks';
import { MessageBubble } from './message-bubble';
import { TurnModelSwitchMarker } from './turn-model-switch';

export const SessionTranscriptRow = memo(function SessionTranscriptRow({
  item,
  id,
  catalog,
}: {
  item: SessionTranscriptItem;
  id: string;
  catalog?: TurnTargetCatalog | undefined;
}) {
  const t = useStrings();
  switch (item.kind) {
    case 'model-switch':
      return <TurnModelSwitchMarker change={item} catalog={catalog} />;
    case 'input':
    case 'reply':
      if (item.kind === 'input' && item.source === 'system')
        return <TranscriptNote text={item.text} label={t.sessionDetail.prompt} />;
      return (
        <MessageBubble
          streaming={item.kind === 'reply' && item.live === true}
          message={{
            id,
            at: item.at,
            author: item.kind === 'input' ? 'human' : 'bot',
            body: item.text,
            delivery: 'committed',
            attachments: [],
          }}
        />
      );
    case 'tool': {
      const { status } = item;
      const kind = item.toolKind === 'move' || item.toolKind === 'delete' ? 'edit' : item.toolKind;
      return (
        <View
          testID="session-transcript-tool"
          accessible
          accessibilityLabel={`${item.tool}, ${t.assignmentDetail.stepState[status]}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
            paddingHorizontal: space.x5,
          }}
        >
          <StepMark status={status} />
          <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {t.assignmentDetail.stepKind[kind]} · {item.detail ?? item.tool}
          </Text>
        </View>
      );
    }
    case 'reasoning':
      return <TranscriptNote text={item.text} label={t.sessionDetail.thinking} />;
    case 'turn-end':
      return item.state === 'done' ? null : (
        <TranscriptNote
          label={t.assignmentDetail.stepState[item.state]}
          text={item.message ?? ''}
        />
      );
  }
});

function TranscriptNote({ label, text }: { label: string; text: string }) {
  return (
    <Text
      variant="meta"
      tone="muted"
      numberOfLines={2}
      selectable
      style={{ paddingHorizontal: space.x5 }}
    >
      {text === '' ? label : `${label} · ${text}`}
    </Text>
  );
}
