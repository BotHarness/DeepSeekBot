import { SectionList, View } from 'react-native';
import {
  MAX_INITIAL_CHANNEL_PEOPLE,
  selectedChannelPeople,
  type ChannelCandidate,
  type PersonCandidate,
} from '../../host/channel-creation';
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
import { AccountAvatar } from './account-avatar';

type Row =
  | { kind: 'bot'; bot: ChannelCandidate }
  | { kind: 'person'; person: PersonCandidate }
  | { kind: 'status'; status: 'bots-empty' | 'people-loading' | 'people-empty' | 'people-error' };

export function CreateChannelMembersScreen() {
  const t = useStrings();
  const theme = useDesignTheme();
  const state = useChannelCreation();
  const record = state.record;
  const editable = state.loaded && record.kind === 'draft' && !state.busy && !state.loading;
  const draft = record.kind === 'draft' && !!record.hostId;
  const humanIds = record.humanIds ?? [];
  const canSelectPeople =
    state.peopleStatus === 'ready' && humanIds.length < MAX_INITIAL_CHANNEL_PEOPLE;
  const bots: Row[] = draft
    ? state.candidates.length > 0
      ? state.candidates.map((bot) => ({ kind: 'bot', bot }))
      : state.loading
        ? []
        : [{ kind: 'status', status: 'bots-empty' }]
    : [];
  const people: Row[] = [];
  if (draft) {
    const available =
      state.peopleStatus === 'ready' || state.peopleStatus === 'loading' ? state.people : [];
    const visibleIds = new Set(available.map((person) => person.id));
    for (const person of available) people.push({ kind: 'person', person });
    for (const person of selectedChannelPeople(state)) {
      if (!visibleIds.has(person.id)) people.push({ kind: 'person', person });
    }
    if (state.peopleStatus === 'loading') people.push({ kind: 'status', status: 'people-loading' });
    if (state.peopleStatus === 'error' || (state.peopleStatus === 'off' && humanIds.length > 0))
      people.push({ kind: 'status', status: 'people-error' });
    if (state.peopleStatus === 'ready' && people.length === 0)
      people.push({ kind: 'status', status: 'people-empty' });
  }
  const sections = [
    ...(bots.length > 0 ? [{ key: 'bots', title: t.channelCreation.bots, data: bots }] : []),
    ...(people.length > 0
      ? [{ key: 'people', title: t.channelCreation.people, data: people }]
      : []),
  ];
  const statusRow = (status: Extract<Row, { kind: 'status' }>['status']) => {
    switch (status) {
      case 'bots-empty':
        return <SettingsRow on={SHEET_GROUP} title={t.channelCreation.empty} tone="muted" />;
      case 'people-loading':
        return (
          <SettingsRow
            on={SHEET_GROUP}
            testID="create-channel-people-loading"
            title={t.channelCreation.peopleLoading}
            tone="muted"
            control={{ kind: 'busy' }}
          />
        );
      case 'people-empty':
        return (
          <SettingsRow
            on={SHEET_GROUP}
            testID="create-channel-people-empty"
            title={t.channelCreation.peopleEmpty}
            tone="muted"
          />
        );
      case 'people-error':
        return (
          <SettingsRow
            on={SHEET_GROUP}
            testID="create-channel-people-retry"
            title={t.channelCreation.peopleRetry}
            detail={t.channelCreation.peopleFailed}
            onPress={() => void channelCreation.refreshPeople()}
          />
        );
    }
  };
  return (
    <SectionList<Row, { key: string; title: string; data: Row[] }>
      testID="create-channel-members"
      sections={sections}
      extraData={[record.members, humanIds, editable]}
      keyExtractor={(row) =>
        row.kind === 'bot'
          ? `bot:${row.bot.slug}`
          : row.kind === 'person'
            ? `human:${row.person.id}`
            : row.status
      }
      stickySectionHeadersEnabled={false}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: space.x5 }}
      ListFooterComponent={
        draft && sections.length > 0 ? (
          <View style={{ paddingTop: space.x2 }}>
            <SettingsFooter>
              {t.channelCreation.selected(record.members.length + humanIds.length)}
            </SettingsFooter>
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        draft ? undefined : <SettingsFooter>{t.channelCreation.chooseHost}</SettingsFooter>
      }
      renderSectionHeader={({ section }) => (
        <View style={{ paddingTop: section.key === 'bots' ? 0 : space.x5 }}>
          <SettingsHeading>{section.title}</SettingsHeading>
        </View>
      )}
      renderItem={({ item, index, section }) => {
        const first = index === 0;
        const last = index === section.data.length - 1;
        let row;
        if (item.kind === 'status') row = statusRow(item.status);
        else if (item.kind === 'bot') {
          const checked = record.members.includes(item.bot.slug);
          row = (
            <SettingsRow
              on={SHEET_GROUP}
              testID={`create-channel-bot-${item.bot.slug}`}
              title={item.bot.displayName}
              leading={<BotPortrait bot={item.bot} size={theme.touch} corner={radius.sm} />}
              selected={checked}
              control={checked ? { kind: 'check' } : undefined}
              onPress={editable ? () => channelCreation.toggle(item.bot.slug) : undefined}
            />
          );
        } else {
          const checked = humanIds.includes(item.person.id);
          row = (
            <SettingsRow
              on={SHEET_GROUP}
              testID={`create-channel-person-${item.person.id}`}
              title={item.person.displayName}
              {...(item.person.username === undefined
                ? {}
                : { detail: `@${item.person.username}` })}
              leading={
                <AccountAvatar
                  uri={undefined}
                  name={item.person.displayName}
                  size={theme.touch}
                  layer="well"
                />
              }
              selected={checked}
              control={checked ? { kind: 'check' } : undefined}
              onPress={
                editable && (checked || canSelectPeople)
                  ? () => channelCreation.togglePerson(item.person.id)
                  : undefined
              }
            />
          );
        }
        return (
          <SettingsGroupItem first={first} last={last} on={SHEET_GROUP}>
            {row}
          </SettingsGroupItem>
        );
      }}
    />
  );
}
