import { FlatList, Pressable, View } from 'react-native';

import type { ConversationMessage } from '@botharness/host-client/conversation';
import { receiptGroups, receiptRecipients } from '../../host/delivery-receipt';
import { useDesignTheme } from '../design/theme';
import { radius, rowGlyph, space } from '../design/tokens';
import { SystemListSheet } from '../primitives/system-list-sheet';
import { Text } from '../primitives/text';
import { ChevronRightIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { receiptColor, useReceiptCounts } from './delivery-stack';
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
  const open = (item: (typeof rows)[number]) =>
    onOpenInbox({ botSlug: item.botSlug, missing: item.state === 'missing' });
  if (SystemListSheet !== undefined)
    return (
      <SystemListSheet
        visible={message !== undefined && rows.length > 0}
        title={t.delivery.label}
        closeLabel={t.close}
        sections={[
          {
            key: 'recipients',
            title: summary,
            rows: rows.map((item) => {
              const name = botName(item.botSlug);
              return {
                kind: 'choice' as const,
                key: item.botSlug,
                testID: `delivery-bot-${item.botSlug}`,
                label: name,
                accessibilityLabel: `${t.delivery.openInbox(name)}, ${t.delivery.state[item.state]}`,
                leading: {
                  size: space.x3,
                  node: (
                    <View
                      style={{
                        width: space.x3,
                        height: space.x3,
                        borderRadius: radius.round,
                        backgroundColor: receiptColor(theme, item.state),
                      }}
                    />
                  ),
                },
                value: t.delivery.state[item.state],
                accessory: 'chevron' as const,
                onPress: () => open(item),
              };
            }),
          },
        ]}
        onClose={onClose}
      />
    );
  return (
    <Sheet
      visible={message !== undefined && rows.length > 0}
      label={t.delivery.label}
      title={t.delivery.label}
      subtitle={summary}
      onClose={onClose}
    >
      <FlatList
        nestedScrollEnabled
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
              onPress={() => open(item)}
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
              <ChevronRightIcon color={theme.color.subtle} size={rowGlyph.size * theme.fontScale} />
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}
