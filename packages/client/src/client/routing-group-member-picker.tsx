import {
  routingGroupEngineChoices,
  routingGroupEnginePresentation,
} from '@botharness/host-client/model-catalog';
import {
  enginePickerAccountKey,
  ENGINE_IDS,
  type RoutingGroupEngineOptions,
} from '@botharness/host-protocol/subscription-engine';
import { useRef, useState, type ReactElement } from 'react';

import type {
  ModelCatalogEntryView,
  ModelCatalogGroupView,
  RoutingGroupMemberView,
} from './bridge.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  catalogMenuItems,
  engineMenuKey,
  groupMenuKey,
  ModelMenu,
  type ModelMenuItem,
} from './model-menu.js';
import { routingGroupEngineCopy, routingGroupEngineReason } from './session-engine.js';

export function routingGroupMemberKey(member: RoutingGroupMemberView): string {
  switch (member.kind) {
    case 'group':
      return `group:${member.id}`;
    case 'engine':
      return `engine:${JSON.stringify([enginePickerAccountKey(member.engine, member.accountId), member.model ?? '', member.reasoningEffort ?? ''])}`;
    case 'model':
      return `model:${JSON.stringify([member.provider, member.model, member.reasoningEffort ?? ''])}`;
  }
}

export function RoutingGroupMemberPicker({
  models,
  groups,
  members,
  selfId,
  engines,
  engineReadFailed,
  refreshEngines,
  onSelect,
  t,
}: {
  models: readonly ModelCatalogEntryView[];
  groups: readonly ModelCatalogGroupView[];
  members: readonly RoutingGroupMemberView[];
  selfId: string | undefined;
  engines: RoutingGroupEngineOptions[] | undefined;
  engineReadFailed: boolean;
  refreshEngines(): void;
  onSelect(member: RoutingGroupMemberView): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const anchor = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  return (
    <div>
      <Button
        ref={anchor}
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (!picking) refreshEngines();
          setPicking(!picking);
        }}
        aria-haspopup="dialog"
        aria-expanded={picking}
      >
        <Icon name="plus" size={16} />
        {t('routingGroups.add')}
      </Button>
      {picking ? (
        <MemberMenu
          catalog={models}
          groups={groups.filter((group) => group.id !== selfId)}
          members={members}
          engines={engines}
          engineReadFailed={engineReadFailed}
          refreshEngines={refreshEngines}
          anchor={anchor}
          onClose={() => setPicking(false)}
          onSelect={onSelect}
          t={t}
        />
      ) : null}
    </div>
  );
}

function MemberMenu({
  catalog,
  groups,
  members,
  engines,
  engineReadFailed,
  refreshEngines,
  anchor,
  onClose,
  onSelect,
  t,
}: {
  catalog: readonly ModelCatalogEntryView[];
  groups: readonly ModelCatalogGroupView[];
  members: readonly RoutingGroupMemberView[];
  engines: RoutingGroupEngineOptions[] | undefined;
  engineReadFailed: boolean;
  refreshEngines(): void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose(): void;
  onSelect(member: RoutingGroupMemberView): void;
  t: BotHarnessTranslate;
}) {
  const [selected, setSelected] = useState('');
  const openedEngineFilter = useRef(false);
  const taken = new Set(members.map(routingGroupMemberKey));
  const choices = new Map<
    string,
    {
      member: RoutingGroupMemberView;
      efforts?: ModelCatalogEntryView['efforts'];
      defaultEffort?: string | undefined;
    }
  >();
  for (const entry of catalog) {
    const member = { kind: 'model' as const, provider: entry.provider, model: entry.model };
    choices.set(JSON.stringify([entry.provider, entry.model]), { ...entry, member });
  }
  for (const group of groups)
    choices.set(groupMenuKey(group.id), { member: { kind: 'group', id: group.id } });
  const engineItems = routingGroupEngineChoices(engines ?? []).map(
    ({ member, model, isDefault, accountName }): ModelMenuItem => {
      const key = engineMenuKey(member.engine, member.model, member.accountId);
      choices.set(key, { ...model, member });
      const row = routingGroupEnginePresentation(
        member,
        routingGroupEngineCopy(t),
        model.name,
        accountName,
      );
      return {
        value: key,
        label: row.title,
        name: row.name,
        hint: row.detail,
        brand: row.brand,
        engine: member.engine,
        model: member.model,
        ...(isDefault
          ? {
              tag: t('routingGroups.defaultTag'),
              hintLabel: `${row.detail} · ${t('routingGroups.defaultTag')}`,
            }
          : {}),
      };
    },
  );
  const available = (key: string) => {
    const choice = choices.get(key);
    if (choice === undefined) return [];
    const { member } = choice;
    if (member.kind === 'group') return [];
    return [
      { value: '', label: t('modelPreset.providerDefault') },
      ...(choice.efforts ?? [])
        .filter((effort) => effort.id !== '')
        .map((effort) => ({
          value: effort.id,
          label: effort.name,
        })),
    ].filter(
      ({ value }) =>
        !taken.has(
          routingGroupMemberKey(value === '' ? member : { ...member, reasoningEffort: value }),
        ),
    );
  };
  const engineFilters = Object.fromEntries(
    ENGINE_IDS.map((engine) => {
      const statuses = engines?.filter((entry) => entry.engine === engine);
      const status =
        statuses?.find((entry) => entry.available && entry.models.length > 0) ??
        statuses?.find((entry) => entry.available) ??
        statuses?.[0];
      const retry = { label: t('routingGroups.retryEngines'), onPress: refreshEngines };
      const notice = engineReadFailed
        ? { message: t('routingGroups.enginesUnavailable'), retry }
        : status?.available === false
          ? {
              message: routingGroupEngineReason(engine, status.reason, t),
              ...(status.reason === 'models-unavailable' ? { retry } : {}),
            }
          : status === undefined
            ? {
                message: t(
                  engines === undefined ? 'modelPreset.loading' : 'routingGroups.noEngines',
                ),
              }
            : status.models.length === 0
              ? { message: t('engine.noModels') }
              : undefined;
      return [
        engine,
        {
          status: notice,
          onActivate: () => {
            if (openedEngineFilter.current) refreshEngines();
            openedEngineFilter.current = true;
          },
        },
      ];
    }),
  );
  const items = [...catalogMenuItems(catalog, t, groups), ...engineItems]
    .filter((item) => {
      const choice = choices.get(item.value);
      return choice?.member.kind === 'group'
        ? !taken.has(routingGroupMemberKey(choice.member))
        : available(item.value).length > 0;
    })
    .map((item) => ({ ...item, disabled: false }));
  const commit = (key: string, effort: string) => {
    const member = choices.get(key)?.member;
    if (member === undefined) return;
    onSelect(
      member.kind === 'group' || effort === '' ? member : { ...member, reasoningEffort: effort },
    );
    onClose();
    anchor.current?.focus();
  };
  const efforts = available(selected);
  return (
    <ModelMenu
      label={t('routingGroups.add')}
      items={items}
      value={selected}
      closeOnSelect={false}
      manageFavorites={false}
      engineFilters={engineFilters}
      efforts={efforts}
      effort={choices.get(selected)?.defaultEffort ?? ''}
      onEffort={(effort) => commit(selected, effort)}
      onBrowse={() => setSelected('')}
      onSelect={(key) => {
        const options = available(key);
        if (options.length > 1) setSelected(key);
        else commit(key, options[0]?.value ?? '');
      }}
      anchorRef={anchor}
      portalContainer={anchor.current?.closest('[aria-modal="true"]') ?? null}
      onClose={onClose}
      t={t}
    />
  );
}
