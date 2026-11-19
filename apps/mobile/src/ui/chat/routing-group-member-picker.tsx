import { useMemo, useState } from 'react';
import { FlatList, Keyboard } from 'react-native';

import {
  modelCatalogGroupFront,
  type ModelCatalogAnswer,
  type ModelCatalogEntry,
  type ModelCatalogGroup,
  type RoutingGroupMember,
} from '@botharness/host-client/model-catalog';
import { searchModels } from '@botharness/host-client/model-settings';
import { sameModel } from '@botharness/host-client/bot-settings';

import { space } from '../design/tokens';
import { SearchField } from '../primitives/search-field';
import { SettingsGroupItem } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { ModelGroupPickerRow, ModelPickerRow } from './model-picker-row';
import { SHEET_GROUP, Sheet, SheetNote } from './sheet';

type Choice =
  | { kind: 'model'; entry: ModelCatalogEntry }
  | { kind: 'group'; group: ModelCatalogGroup };

export function routingGroupMemberKey(member: RoutingGroupMember): string {
  return member.kind === 'group'
    ? `group:${member.id}`
    : JSON.stringify([member.provider, member.model, member.reasoningEffort ?? '']);
}

export function RoutingGroupMemberPicker({
  catalog,
  selfId,
  members,
  onSelect,
  onClose,
}: {
  catalog: ModelCatalogAnswer;
  selfId: string | undefined;
  members: RoutingGroupMember[];
  onSelect(member: RoutingGroupMember): void;
  onClose(): void;
}) {
  const t = useStrings();
  const [query, setQuery] = useState('');
  const data = useMemo((): Choice[] => {
    const taken = new Set(members.map(routingGroupMemberKey));
    const needle = query.trim().toLowerCase();
    return [
      ...(catalog.groups ?? [])
        .filter(
          (group) =>
            group.id !== selfId &&
            !taken.has(`group:${group.id}`) &&
            group.name.toLowerCase().includes(needle),
        )
        .map((group): Choice => ({ kind: 'group', group })),
      ...searchModels(catalog.models, query)
        .filter(
          (entry) =>
            !taken.has(
              routingGroupMemberKey({
                kind: 'model',
                provider: entry.provider,
                model: entry.model,
              }),
            ),
        )
        .map((entry): Choice => ({ kind: 'model', entry })),
    ];
  }, [catalog, members, query, selfId]);
  const select = (member: RoutingGroupMember) => {
    Keyboard.dismiss();
    onSelect(member);
  };
  const key = (row: Choice) =>
    row.kind === 'group'
      ? `group:${row.group.id}`
      : JSON.stringify([row.entry.provider, row.entry.model]);
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  return (
    <Sheet
      title={t.routingGroup.addMember}
      label={t.routingGroup.addMember}
      visible
      avoidKeyboard
      fill
      onClose={close}
    >
      <SearchField
        testID="routing-group-member-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t.routingGroup.searchMembers}
        inset={space.x5}
      />
      <FlatList
        nestedScrollEnabled
        data={data}
        keyExtractor={key}
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{ paddingTop: space.x3 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<SheetNote>{t.routingGroup.noOptions}</SheetNote>}
        renderItem={({ item, index }) => {
          const front =
            item.kind === 'group' ? modelCatalogGroupFront(item.group, catalog.models) : undefined;
          const row =
            item.kind === 'model' ? (
              <ModelPickerRow
                entry={item.entry}
                testID={`routing-member-model-${item.entry.provider}-${item.entry.model}`}
                onPress={() =>
                  select({ kind: 'model', provider: item.entry.provider, model: item.entry.model })
                }
              />
            ) : (
              <ModelGroupPickerRow
                group={item.group}
                front={catalog.models.find((entry) => sameModel(entry, front))}
                usable={item.group.restingUntil === undefined}
                showCount
                testID={`routing-member-group-${item.group.id}`}
                onPress={() => select({ kind: 'group', id: item.group.id })}
              />
            );
          return (
            <SettingsGroupItem
              first={index === 0}
              last={index === data.length - 1}
              on={SHEET_GROUP}
            >
              {row}
            </SettingsGroupItem>
          );
        }}
      />
    </Sheet>
  );
}
