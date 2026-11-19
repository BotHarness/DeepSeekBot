import { engineAccountKey } from '@botharness/host-protocol/subscription-engine';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, View } from 'react-native';

import {
  modelCatalogGroupFront,
  routingGroupEngineChoices,
  routingGroupEnginePresentation,
  type ModelCatalogAnswer,
  type ModelCatalogEntry,
  type ModelCatalogGroup,
  type RoutingGroupMember,
} from '@botharness/host-client/model-catalog';
import { searchModels } from '@botharness/host-client/model-settings';
import { sameModel } from '@botharness/host-client/bot-settings';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';

import { space } from '../design/tokens';
import { Chip } from '../primitives/chip';
import { SearchField } from '../primitives/search-field';
import { SettingsGroupItem } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { ModelEnginePickerRow, ModelGroupPickerRow, ModelPickerRow } from './model-picker-row';
import { SHEET_GROUP, Sheet, SheetFailed, SheetLoading, SheetNote } from './sheet';

type Choice =
  | { kind: 'model'; entry: ModelCatalogEntry }
  | { kind: 'group'; group: ModelCatalogGroup }
  | ({ kind: 'engine' } & ReturnType<typeof routingGroupEngineChoices>[number] & {
        row: ReturnType<typeof routingGroupEnginePresentation>;
      });

export function routingGroupMemberKey(member: RoutingGroupMember): string {
  switch (member.kind) {
    case 'group':
      return `group:${member.id}`;
    case 'engine':
      return `engine:${JSON.stringify([engineAccountKey(member.engine, member.accountId), member.model ?? ''])}`;
    case 'model':
      return JSON.stringify([member.provider, member.model, member.reasoningEffort ?? '']);
  }
}

export function RoutingGroupMemberPicker({
  catalog,
  selfId,
  members,
  engines,
  engineReadFailed,
  refreshEngines,
  onSelect,
  onClose,
}: {
  catalog: ModelCatalogAnswer;
  selfId: string | undefined;
  members: RoutingGroupMember[];
  engines: RoutingGroupEngineOptions[] | undefined;
  engineReadFailed: boolean;
  refreshEngines(): void;
  onSelect(member: RoutingGroupMember): void;
  onClose(): void;
}) {
  const t = useStrings();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'models' | 'engines'>('models');
  const showEngineError = source === 'engines' && engineReadFailed;
  const data = useMemo((): Choice[] => {
    const taken = new Set(members.map(routingGroupMemberKey));
    const needle = query.trim().toLocaleLowerCase();
    if (source === 'engines') {
      const terms = needle.split(/\s+/u);
      return routingGroupEngineChoices(engines ?? []).flatMap((choice): Choice[] => {
        if (choice.status.available && taken.has(routingGroupMemberKey(choice.member))) return [];
        const row = routingGroupEnginePresentation(
          choice.member,
          t.routingGroup.engineRow,
          choice.modelName,
          choice.status.accountName,
        );
        const text = [row.name, row.title, row.detail, choice.member.model]
          .join(' ')
          .toLocaleLowerCase();
        if (!terms.every((term) => text.includes(term))) return [];
        return [{ kind: 'engine', ...choice, row }];
      });
    }
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
  }, [catalog, engines, members, query, selfId, source, t.routingGroup.engineRow]);
  const select = (member: RoutingGroupMember) => {
    Keyboard.dismiss();
    onSelect(member);
  };
  const key = (row: Choice) => {
    switch (row.kind) {
      case 'model':
        return JSON.stringify([row.entry.provider, row.entry.model]);
      case 'group':
        return `group:${row.group.id}`;
      case 'engine':
        return routingGroupMemberKey(row.member);
    }
  };
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
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: space.x2,
          paddingHorizontal: space.x5,
          paddingVertical: space.x2,
        }}
      >
        <Chip
          testID="routing-member-filter-models"
          label={t.routingGroup.models}
          selected={source === 'models'}
          onPress={() => setSource('models')}
        />
        <Chip
          testID="routing-member-filter-engines"
          label={t.routingGroup.engines}
          selected={source === 'engines'}
          onPress={() => {
            if (source !== 'engines') refreshEngines();
            setSource('engines');
          }}
        />
      </View>
      {showEngineError ? (
        <SheetFailed
          message={t.routingGroup.enginesUnavailable}
          onRetry={refreshEngines}
          on={SHEET_GROUP}
        />
      ) : null}
      <FlatList
        nestedScrollEnabled
        data={data}
        keyExtractor={key}
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{ paddingTop: space.x3 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          showEngineError ? (
            <></>
          ) : source === 'engines' && engines === undefined ? (
            <SheetLoading />
          ) : (
            <SheetNote>
              {source === 'engines' && engines?.length === 0
                ? t.routingGroup.noEngines
                : t.routingGroup.noOptions}
            </SheetNote>
          )
        }
        renderItem={({ item, index }) => {
          const front =
            item.kind === 'group' ? modelCatalogGroupFront(item.group, catalog.models) : undefined;
          const row =
            item.kind === 'model' ? (
              <ModelPickerRow
                entry={item.entry}
                shortTitle
                testID={`routing-member-model-${item.entry.provider}-${item.entry.model}`}
                onPress={() =>
                  select({ kind: 'model', provider: item.entry.provider, model: item.entry.model })
                }
              />
            ) : item.kind === 'engine' ? (
              <ModelEnginePickerRow
                row={item.row}
                reason={
                  item.status.available
                    ? undefined
                    : t.routingGroup.engineUnavailable[item.status.reason]
                }
                testID={`routing-member-engine-${item.member.accountId ?? item.member.engine}-${item.member.model ?? 'default'}`}
                onPress={item.status.available ? () => select(item.member) : undefined}
              />
            ) : (
              <ModelGroupPickerRow
                group={item.group}
                front={catalog.models.find((entry) => sameModel(entry, front))}
                models={catalog.models}
                groups={catalog.groups ?? []}
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
