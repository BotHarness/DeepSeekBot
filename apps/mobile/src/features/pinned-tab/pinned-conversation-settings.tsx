import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';

import { SHEET_GROUP } from '../../ui/chat/sheet';
import { titleOf, type Conversation } from '../../ui/chat/conversations';
import { useDesignTheme } from '../../ui/design/theme';
import { edge, space } from '../../ui/design/tokens';
import { LoadingIndicator } from '../../ui/primitives/loading-indicator';
import { ReadFailure } from '../../ui/primitives/read-failure';
import { SettingsFooter, SettingsGroupItem, SettingsRow } from '../../ui/primitives/settings-row';
import { useFloatingTabInset } from '../../ui/shell/floating-tab-inset';
import { useStrings } from '../../ui/strings';
import { pinnedBindings, usePinnedBinding } from './native-pinned-binding';
import { PinnedAvatar } from './pinned-avatar';
import { bindingKey, bindingOf, defaultPinnedConversation, pinnedChoices } from './pinned-target';
import { usePinnedHost } from './use-pinned-tab';

type Choice =
  | { kind: 'default'; key: 'default'; conversation: Conversation | undefined }
  | Conversation;

export function PinnedConversationSettings() {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const tabInset = useFloatingTabInset();
  const { hostId, host, pinned } = usePinnedHost();
  const binding = usePinnedBinding(hostId);
  const rows = pinned === undefined ? undefined : pinnedChoices(pinned);
  const fallback =
    rows === undefined || pinned?.roster === undefined
      ? undefined
      : defaultPinnedConversation(pinned.roster, rows);
  const boundKey = binding === undefined ? undefined : bindingKey(binding);
  const bound = boundKey !== undefined && rows?.some((row) => row.key === boundKey) === true;
  const choose = (conversation: Conversation | undefined) => {
    if (hostId === undefined) return;
    pinnedBindings.bind(hostId, conversation === undefined ? undefined : bindingOf(conversation));
    if (router.canGoBack()) router.back();
  };
  const size = theme.type.title.line * theme.fontScale + (edge.focus + space.x1) * 2;
  const data: Choice[] =
    rows === undefined
      ? []
      : [{ kind: 'default', key: 'default', conversation: fallback }, ...rows];
  const connection = host?.snapshot.connection;
  let empty;
  if (connection === undefined) {
    empty = <SettingsFooter>{t.tabBarSettings.pinnedFooterNone}</SettingsFooter>;
  } else if (connection.status === 'unreachable') {
    empty = (
      <View style={{ paddingHorizontal: space.x5 }}>
        <ReadFailure title={t.pinnedTab.loadFailed} onRetry={() => host?.client.retryNow()} />
      </View>
    );
  } else if (connection.status === 'refused' || connection.status === 'stopped') {
    empty = (
      <SettingsFooter>
        {connection.status === 'refused'
          ? t.deviceRefusal[connection.code]
          : t.pinnedTab.loadFailed}
      </SettingsFooter>
    );
  } else {
    empty = <LoadingIndicator accessibilityLabel={t.pinnedTab.loading} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      <FlatList<Choice>
        testID="pinned-conversation-list"
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingVertical: space.x5, paddingBottom: space.x5 + tabInset }}
        data={data}
        keyExtractor={(item) => item.key}
        ListEmptyComponent={empty}
        ListFooterComponent={
          rows !== undefined && rows.length === 0 ? (
            <View style={{ paddingTop: space.x3 }}>
              <SettingsFooter>{t.tabBarSettings.pickerEmpty}</SettingsFooter>
            </View>
          ) : undefined
        }
        renderItem={({ item, index }) => {
          const isDefault = item.kind === 'default';
          const conversation = isDefault ? item.conversation : item;
          const selected = isDefault ? !bound : item.key === boundKey && bound;
          return (
            <SettingsGroupItem
              first={index === 0}
              last={index === data.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                on={SHEET_GROUP}
                title={isDefault ? t.tabBarSettings.defaultChoice : titleOf(item)}
                detail={isDefault ? t.tabBarSettings.defaultDetail : undefined}
                leading={<PinnedAvatar conversation={conversation} size={size} selected={false} />}
                selected={selected}
                {...(selected ? { control: { kind: 'check' } as const } : {})}
                testID={isDefault ? 'pinned-choice-default' : `pinned-choice-${item.key}`}
                onPress={() => choose(isDefault ? undefined : item)}
              />
            </SettingsGroupItem>
          );
        }}
      />
    </View>
  );
}
