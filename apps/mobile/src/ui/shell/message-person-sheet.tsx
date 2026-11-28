import { useRef, useState } from 'react';
import { FlatList, View, type ViewInstance } from 'react-native';

import type { HostClient } from '@botharness/host-client/client';
import {
  filterTeamPeople,
  openHumanDm,
  readTeamDirectory,
  type HumanDmTarget,
  type TeamPerson,
} from '@botharness/host-client/human-dm';
import { SHEET_GROUP, Sheet, SheetFailed } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { dismissSheetSearchKeyboard, SheetSearchField } from '../primitives/sheet-search-field';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { AccountAvatar } from './account-avatar';

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; people: TeamPerson[] };

export function MessagePersonSheet({
  client,
  onClose,
  onOpened,
}: {
  client: HostClient | undefined;
  onClose(): void;
  onOpened(target: HumanDmTarget): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string>();
  const [openFailed, setOpenFailed] = useState(false);
  const live = useRef(false);
  const generation = useRef(0);
  const mount = useMounted<ViewInstance>(() => {
    live.current = true;
    generation.current += 1;
    setOpening(undefined);
    setOpenFailed(false);
    let current = true;
    setLoad({ state: 'loading' });
    if (client === undefined) setLoad({ state: 'failed' });
    else
      readTeamDirectory(client).then(
        (people) => {
          if (current) setLoad({ state: 'ready', people });
        },
        () => {
          if (current) setLoad({ state: 'failed' });
        },
      );
    return () => {
      current = false;
      live.current = false;
    };
  }, [client, attempt]);
  const close = () => {
    dismissSheetSearchKeyboard();
    onClose();
  };
  const open = async (person: TeamPerson) => {
    if (client === undefined || opening !== undefined) return;
    const requested = generation.current;
    const stale = () => !live.current || generation.current !== requested;
    setOpening(person.humanId);
    setOpenFailed(false);
    try {
      const target = await openHumanDm(client, person);
      if (stale()) return;
      dismissSheetSearchKeyboard();
      onOpened(target);
    } catch {
      if (stale()) return;
      setOpening(undefined);
      setOpenFailed(true);
    }
  };
  const people = load.state === 'ready' ? filterTeamPeople(load.people, query) : [];
  const notice =
    load.state === 'loading' ? (
      <SettingsGroupItem first last on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          testID="message-person-loading"
          title={t.messagePerson.loading}
          tone="muted"
          control={{ kind: 'busy' }}
        />
      </SettingsGroupItem>
    ) : load.state === 'failed' ? (
      <SheetFailed
        message={t.messagePerson.loadFailed}
        onRetry={() => setAttempt((value) => value + 1)}
        on={SHEET_GROUP}
      />
    ) : load.people.length === 0 ? (
      <Text tone="muted">{t.messagePerson.empty}</Text>
    ) : people.length === 0 ? (
      <Text tone="muted">{t.messagePerson.noMatch}</Text>
    ) : null;
  return (
    <Sheet
      title={t.messagePerson.title}
      label={t.messagePerson.title}
      visible
      avoidKeyboard
      fill
      onClose={close}
    >
      <View ref={mount} style={{ flexShrink: 1 }}>
        {load.state === 'ready' && load.people.length > 0 ? (
          <SheetSearchField
            testID="message-person-search"
            value={query}
            onChangeText={setQuery}
            placeholder={t.messagePerson.search}
            inset={space.x5}
          />
        ) : null}
        {openFailed ? (
          <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}>
            <Text accessibilityRole="alert" tone="danger">
              {t.messagePerson.openFailed}
            </Text>
          </View>
        ) : null}
        <FlatList
          testID="message-person-list"
          nestedScrollEnabled
          data={people}
          keyExtractor={(person) => person.humanId}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ paddingVertical: space.x3 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={notice ?? undefined}
          renderItem={({ item, index }) => (
            <SettingsGroupItem
              first={index === 0}
              last={index === people.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                on={SHEET_GROUP}
                testID={`message-person-${item.humanId}`}
                title={item.displayName}
                leading={
                  <AccountAvatar
                    uri={undefined}
                    name={item.displayName}
                    size={theme.touch}
                    layer="well"
                  />
                }
                control={opening === item.humanId ? { kind: 'busy' } : undefined}
                onPress={opening === undefined ? () => void open(item) : undefined}
              />
            </SettingsGroupItem>
          )}
        />
      </View>
    </Sheet>
  );
}
