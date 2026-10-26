import { FlatList, Pressable, View } from 'react-native';

import type { ConversationMessage } from '../../host/conversation';
import { receiptGroups, receiptRecipients } from '../../host/delivery-receipt';
import { useDesignTheme } from '../design/theme';
import { radius, rowGlyph, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ChevronRightIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { receiptColor, useReceiptCounts } from './delivery-pie';
import { Sheet } from './sheet';

export function DeliverySheet({
  message,
  botName,
  onClose,
  onOpenInbox,
}: {
  message: ConversationMessage | undefined;
  botName(slug: string): string;
  onClose(): void;
  onOpenInbox(target: { botSlug: string; missing: boolean }): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const recipients = message === undefined ? [] : receiptRecipients(message);
  const summary = useReceiptCounts(recipients);
  const rows = receiptGroups(recipients).flatMap((group) => group.recipients);
  return (
    <Sheet
      visible={message !== undefined && rows.length > 0}
      label={t.delivery.label}
      title={t.delivery.label}
      subtitle={summary}
      onClose={onClose}
    >
      <FlatList
        data={rows}
        keyExtractor={(row) => row.botSlug}
        contentContainerStyle={{
          paddingHorizontal: space.x5,
          paddingBottom: space.x3,
        }}
        renderItem={({ item }) => {
          const name = botName(item.botSlug);
          return (
            <Pressable
              testID={`delivery-bot-${item.botSlug}`}
              accessibilityRole="button"
              accessibilityLabel={`${t.delivery.openInbox(name)}, ${t.delivery.state[item.state]}`}
              onPress={() =>
                onOpenInbox({
                  botSlug: item.botSlug,
                  missing: item.state === 'missing',
                })
              }
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x4,
                minHeight: theme.touch,
                paddingHorizontal: space.x3,
                borderRadius: radius.md,
                backgroundColor: pressed ? theme.layer.raised.pressed : undefined,
              })}
            >
              <View
                style={{
                  width: space.x3,
                  height: space.x3,
                  borderRadius: radius.round,
                  backgroundColor: receiptColor(theme, item.state),
                }}
              />
              <Text numberOfLines={1} style={{ flex: 1 }}>
                {name}
              </Text>
              <Text variant="meta" tone="muted">
                {t.delivery.state[item.state]}
              </Text>
              <ChevronRightIcon color={theme.color.subtle} size={rowGlyph.size} />
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}
