import { Pressable } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { ConversationMessage } from '../../host/conversation';
import {
  receiptGroups,
  receiptRecipients,
  type ReceiptRecipient,
  type ReceiptState,
} from '../../host/delivery-receipt';
import type { DesignTheme } from '../design/resolve-theme';
import { useDesignTheme } from '../design/theme';
import { rowGlyph } from '../design/tokens';
import { useStrings } from '../strings';

export function receiptColor(theme: DesignTheme, state: ReceiptState): string {
  switch (state) {
    case 'handled':
      return theme.color.success;
    case 'running':
      return theme.color.accent;
    case 'observed':
      return theme.color.fg;
    case 'pending':
      return theme.color.muted;
    case 'ignored':
      return theme.color.subtle;
    case 'missing':
      return theme.color.warning;
    default:
      return theme.color.danger;
  }
}

function wedge(from: number, to: number, size: number): string {
  const r = size / 2;
  const point = (turn: number) => {
    const angle = turn * 2 * Math.PI - Math.PI / 2;
    return `${r + r * Math.cos(angle)} ${r + r * Math.sin(angle)}`;
  };
  return `M${r} ${r}L${point(from)}A${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${point(to)}Z`;
}

export function DeliveryPie({
  recipients,
  size = rowGlyph.size,
}: {
  recipients: readonly ReceiptRecipient[];
  size?: number;
}) {
  const theme = useDesignTheme();
  const groups = receiptGroups(recipients);
  let start = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {groups.length === 1 ? (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2}
          fill={receiptColor(theme, groups[0]!.state)}
        />
      ) : (
        groups.map((group) => {
          const end = start + group.recipients.length / recipients.length;
          const d = wedge(start, end, size);
          start = end;
          return <Path key={group.state} d={d} fill={receiptColor(theme, group.state)} />;
        })
      )}
    </Svg>
  );
}

export function useReceiptCounts(recipients: readonly ReceiptRecipient[]): string {
  const t = useStrings();
  return receiptGroups(recipients)
    .map((group) => `${group.recipients.length} ${t.delivery.state[group.state]}`)
    .join(' · ');
}

export function DeliveryReceiptButton({
  message,
  onOpen,
}: {
  message: ConversationMessage;
  onOpen(message: ConversationMessage): void;
}) {
  const theme = useDesignTheme();
  const recipients = receiptRecipients(message);
  const t = useStrings();
  const summary = t.delivery.summary(useReceiptCounts(recipients));
  if (recipients.length === 0) return null;
  return (
    <Pressable
      testID={`message-delivery-${message.id}`}
      accessibilityRole="button"
      accessibilityLabel={summary}
      hitSlop={(theme.touch - rowGlyph.size) / 2}
      onPress={() => onOpen(message)}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <DeliveryPie recipients={recipients} />
    </Pressable>
  );
}
