import { enginePickerAccountKey } from '@botharness/host-protocol/subscription-engine';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard } from 'react-native';

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
import { modelFamilies } from '@botharness/host-client/shared/model-brand';
import {
  ENGINE_DEFINITIONS,
  ENGINE_IDS,
  type RoutingGroupEngineOptions,
} from '@botharness/host-protocol/subscription-engine';

import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Chip } from '../primitives/chip';
import { SearchField } from '../primitives/search-field';
import { SettingsGroupItem } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { modelFamilyKey } from './composer-labels';
import { EffortBar } from './model-effort';
import { ModelPickerFilters } from './model-picker-filters';
import { ModelEnginePickerRow, ModelGroupPickerRow, ModelPickerRow } from './model-picker-row';
import { effortChoices } from './model-route-text';
import { SHEET_GROUP, Sheet, SheetActions, SheetFailed, SheetLoading, SheetNote } from './sheet';

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
      return `engine:${JSON.stringify([enginePickerAccountKey(member.engine, member.accountId), member.model ?? '', member.reasoningEffort ?? ''])}`;
    case 'model':
      return JSON.stringify([member.provider, member.model, member.reasoningEffort ?? '']);
  }
}

function memberOf(choice: Choice): RoutingGroupMember {
  switch (choice.kind) {
    case 'engine':
      return choice.member;
    case 'group':
      return { kind: 'group', id: choice.group.id };
    case 'model':
      return { kind: 'model', provider: choice.entry.provider, model: choice.entry.model };
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
  const openedEngineFilter = useRef(false);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [selected, setSelected] = useState<{ key: string; effort: string }>();
  const taken = useMemo(() => new Set(members.map(routingGroupMemberKey)), [members]);
  const families = useMemo(
    () =>
      modelFamilies(
        catalog.models.map((entry) => ({
          provider: entry.provider,
          model: entry.model,
          name: entry.modelName,
        })),
      ),
    [catalog.models],
  );
  const engineId = ENGINE_IDS.find((engine) => source === `engine-${engine}`);
  const statuses = engines?.filter((entry) => entry.engine === engineId);
  const status =
    statuses?.find((entry) => entry.available && entry.models.length > 0) ??
    statuses?.find((entry) => entry.available) ??
    statuses?.[0];
  const engineError =
    engineId !== undefined &&
    (engineReadFailed || (status?.available === false && status.reason === 'models-unavailable'));
  const data = useMemo((): Choice[] => {
    const needle = query.trim().toLocaleLowerCase();
    const terms = needle.split(/\s+/u);
    const groups =
      source === 'all' || source === 'groups'
        ? (catalog.groups ?? [])
            .filter((group) => group.id !== selfId && group.name.toLowerCase().includes(needle))
            .map((group): Choice => ({ kind: 'group', group }))
        : [];
    const models =
      engineId === undefined && source !== 'groups'
        ? searchModels(catalog.models, query)
            .filter((entry) => source === 'all' || modelFamilyKey(entry) === source)
            .map((entry): Choice => ({ kind: 'model', entry }))
        : [];
    const subscriptions =
      source === 'all' || engineId !== undefined
        ? routingGroupEngineChoices(engines ?? []).flatMap((choice): Choice[] => {
            if (engineId !== undefined && choice.member.engine !== engineId) return [];
            const row = routingGroupEnginePresentation(
              choice.member,
              t.routingGroup.engineRow,
              choice.model.name,
              choice.accountName,
            );
            const text = [row.name, row.title, row.detail, choice.member.model]
              .join(' ')
              .toLocaleLowerCase();
            return terms.every((term) => text.includes(term))
              ? [{ kind: 'engine', ...choice, row }]
              : [];
          })
        : [];
    return [...groups, ...models, ...subscriptions];
  }, [catalog, engines, engineId, query, selfId, source, t.routingGroup.engineRow]);
  const key = (row: Choice) => routingGroupMemberKey(memberOf(row));
  const effortsOf = (choice: Choice) => {
    const member = memberOf(choice);
    if (member.kind === 'group') return [];
    const efforts = effortChoices(
      choice.kind === 'engine' ? choice.model : choice.kind === 'model' ? choice.entry : undefined,
      t.modelSettings.effortDefault,
    );
    return (
      efforts.length === 0 ? [{ value: '', label: t.modelSettings.effortDefault }] : efforts
    ).filter(
      ({ value }) =>
        !taken.has(
          routingGroupMemberKey(value === '' ? member : { ...member, reasoningEffort: value }),
        ),
    );
  };
  const rows = data.filter((row) =>
    row.kind === 'group' ? !taken.has(key(row)) : effortsOf(row).length > 0,
  );
  const pending = rows.find((row) => key(row) === selected?.key);
  const select = (choice: Choice, effort = '') => {
    Keyboard.dismiss();
    const member = memberOf(choice);
    onSelect(
      member.kind === 'group' || effort === '' ? member : { ...member, reasoningEffort: effort },
    );
  };
  const pick = (choice: Choice) => {
    const options = effortsOf(choice);
    if (options.length <= 1) {
      select(choice, options[0]?.value);
      return;
    }
    Keyboard.dismiss();
    const preferred =
      choice.kind === 'engine'
        ? choice.model.defaultEffort
        : choice.kind === 'model'
          ? choice.entry.defaultEffort
          : undefined;
    setSelected({
      key: key(choice),
      effort: options.find((item) => item.value === preferred)?.value ?? options[0]?.value ?? '',
    });
  };
  const chooseSource = (next: string) => {
    setSource(next);
    setSelected(undefined);
  };
  return (
    <Sheet
      title={t.routingGroup.addMember}
      label={t.routingGroup.addMember}
      visible
      avoidKeyboard
      fill
      onClose={() => {
        Keyboard.dismiss();
        onClose();
      }}
    >
      <SearchField
        testID="routing-group-member-search"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setSelected(undefined);
        }}
        placeholder={t.modelSettings.search}
        inset={space.x5}
      />
      <ModelPickerFilters>
        <Chip
          testID="routing-member-filter-all"
          label={t.modelSettings.allFamilies}
          selected={source === 'all'}
          onPress={() => chooseSource('all')}
        />
        {(catalog.groups ?? []).some((group) => group.id !== selfId) ? (
          <Chip
            testID="routing-member-filter-groups"
            label={t.modelSettings.groups}
            selected={source === 'groups'}
            onPress={() => chooseSource(source === 'groups' ? 'all' : 'groups')}
          />
        ) : null}
        {ENGINE_IDS.map((engine) => (
          <Chip
            key={engine}
            testID={`routing-member-filter-${engine}`}
            label={t.routingGroup.engineRow.subscription(ENGINE_DEFINITIONS[engine].displayName)}
            selected={source === `engine-${engine}`}
            onPress={() => {
              const next = `engine-${engine}`;
              if (source !== next) {
                if (openedEngineFilter.current) refreshEngines();
                openedEngineFilter.current = true;
              }
              chooseSource(source === next ? 'all' : next);
            }}
          />
        ))}
        {families.map(({ brand, title, count }) => {
          const family = brand ?? 'other';
          return (
            <Chip
              key={family}
              testID={`routing-member-filter-${family}`}
              label={title ?? t.modelSettings.otherFamily}
              count={count}
              selected={source === family}
              onPress={() => chooseSource(source === family ? 'all' : family)}
            />
          );
        })}
      </ModelPickerFilters>
      {engineError ? (
        <SheetFailed
          message={
            engineReadFailed
              ? t.routingGroup.enginesUnavailable
              : t.routingGroup.engineModelsUnavailable
          }
          onRetry={refreshEngines}
          on={SHEET_GROUP}
        />
      ) : null}
      <FlatList
        nestedScrollEnabled
        data={rows}
        keyExtractor={key}
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{ paddingTop: space.x3 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          engineError ? undefined : engineId !== undefined && engines === undefined ? (
            <SheetLoading />
          ) : (
            <SheetNote>
              {status?.available === false
                ? t.routingGroup.engineUnavailable[status.reason]
                : engineId !== undefined && status === undefined
                  ? t.routingGroup.noEngines
                  : t.routingGroup.noOptions}
            </SheetNote>
          )
        }
        renderItem={({ item, index }) => {
          const front =
            item.kind === 'group' ? modelCatalogGroupFront(item.group, catalog.models) : undefined;
          const active = selected?.key === key(item);
          const row =
            item.kind === 'model' ? (
              <ModelPickerRow
                entry={item.entry}
                selected={active}
                control={active ? { kind: 'check' } : undefined}
                testID={`routing-member-model-${item.entry.provider}-${item.entry.model}`}
                onPress={() => pick(item)}
              />
            ) : item.kind === 'engine' ? (
              <ModelEnginePickerRow
                row={item.row}
                isDefault={item.isDefault}
                selected={active}
                testID={`routing-member-engine-${enginePickerAccountKey(item.member.engine, item.member.accountId)}-${item.member.model}`}
                onPress={() => pick(item)}
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
                onPress={() => select(item)}
              />
            );
          return (
            <SettingsGroupItem
              first={index === 0}
              last={index === rows.length - 1}
              on={SHEET_GROUP}
            >
              {row}
            </SettingsGroupItem>
          );
        }}
      />
      {pending === undefined || selected === undefined ? null : (
        <>
          <EffortBar
            options={effortsOf(pending)}
            current={selected.effort}
            busy={false}
            onChange={(effort) => setSelected({ ...selected, effort })}
          />
          <SheetActions>
            <Button
              label={t.routingGroup.addMember}
              tone="primary"
              testID="routing-member-confirm"
              onPress={() => select(pending, selected.effort)}
            />
          </SheetActions>
        </>
      )}
    </Sheet>
  );
}
