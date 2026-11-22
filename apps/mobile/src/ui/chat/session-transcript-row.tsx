import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  sessionInputPresentation,
  type SessionTranscriptItem,
} from '@botharness/host-client/session-detail';
import type { TurnTargetCatalog } from '@botharness/host-client/turn-target';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { ChevronDownIcon, ChevronUpIcon } from '../shell/icons';
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
      return <TranscriptInput item={item} id={id} />;
    case 'reply':
      return (
        <MessageBubble
          streaming={item.live === true}
          message={{
            id,
            at: item.at,
            author: 'bot',
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

function TranscriptInput({
  item,
  id,
}: {
  item: Extract<SessionTranscriptItem, { kind: 'input' }>;
  id: string;
}) {
  const t = useStrings().sessionDetail;
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  const input = sessionInputPresentation(item);
  if (input.kind === 'message')
    return (
      <View>
        {input.envelope === undefined ? null : (
          <Text
            variant="meta"
            tone="muted"
            style={{ alignSelf: 'flex-end', paddingHorizontal: space.x5 }}
          >
            {t.envelope[input.envelope]}
          </Text>
        )}
        <MessageBubble
          message={{
            id,
            at: item.at,
            author: 'human',
            body: input.text,
            delivery: 'committed',
            attachments: [],
          }}
        />
      </View>
    );
  const label =
    input.kind === 'trigger'
      ? t.trigger[input.trigger]
      : input.kind === 'skill'
        ? t.skill(input.name)
        : t.envelope.inbox;
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <View style={{ paddingHorizontal: space.x5 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x2,
          minHeight: theme.touch,
        }}
      >
        <Text variant="meta" tone="muted" numberOfLines={2} style={{ flex: 1 }}>
          {!open && input.kind === 'trigger' && input.preview
            ? `${label} · ${input.preview}`
            : label}
        </Text>
        <Chevron color={theme.color.muted} size={theme.type.meta.line} />
      </Pressable>
      {open ? (
        <Text variant="meta" tone="muted" selectable>
          {input.text}
        </Text>
      ) : null}
    </View>
  );
}

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
