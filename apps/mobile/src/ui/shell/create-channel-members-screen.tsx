import { FlatList, View } from 'react-native';
import { channelCreation, useChannelCreation } from '../../host/native-channel-creation';
import { BotPortrait } from '../bot-avatar';
import { SHEET_GROUP } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import {
  SettingsFooter,
  SettingsGroupItem,
  SettingsHeading,
  SettingsRow,
} from '../primitives/settings-row';
import { useStrings } from '../strings';

export function CreateChannelMembersScreen() {
  const t = useStrings();
  const theme = useDesignTheme();
  const state = useChannelCreation();
  const record = state.record;
  const editable = state.loaded && record.kind === 'draft' && !state.busy && !state.loading;
  const candidates = record.kind === 'draft' && record.hostId ? state.candidates : [];
  return (
    <FlatList
      testID="create-channel-members"
      data={candidates}
      extraData={[record.members, editable]}
      keyExtractor={(bot) => bot.slug}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: space.x5 }}
      ListHeaderComponent={
        <View style={{ paddingBottom: space.x2 }}>
          <SettingsHeading>{t.channelCreation.selected(record.members.length)}</SettingsHeading>
        </View>
      }
      ListEmptyComponent={
        <SettingsFooter>
          {record.hostId ? t.channelCreation.empty : t.channelCreation.chooseHost}
        </SettingsFooter>
      }
      ListFooterComponent={
        candidates.length > 0 ? (
          <View style={{ paddingTop: space.x2 }}>
            <SettingsFooter>{t.channelCreation.membersFooter}</SettingsFooter>
          </View>
        ) : undefined
      }
      renderItem={({ item, index }) => {
        const checked = record.members.includes(item.slug);
        return (
          <SettingsGroupItem
            first={index === 0}
            last={index === candidates.length - 1}
            on={SHEET_GROUP}
          >
            <SettingsRow
              on={SHEET_GROUP}
              testID={`create-channel-bot-${item.slug}`}
              title={item.displayName}
              leading={<BotPortrait bot={item} size={theme.touch} corner={radius.sm} />}
              selected={checked}
              control={checked ? { kind: 'check' } : undefined}
              onPress={editable ? () => channelCreation.toggle(item.slug) : undefined}
            />
          </SettingsGroupItem>
        );
      }}
    />
  );
}
