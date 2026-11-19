import {
  routingGroupEngineChoices,
  routingGroupEnginePresentation,
} from '@botharness/host-client/model-catalog';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import { useRef, useState, type ReactElement } from 'react';

import type { ModelCatalogEntryView, RoutingGroupMemberView, RoutingGroupView } from './bridge.js';
import { Button } from './ds/button.js';
import { FilterPicker, type FilterPickerOption } from './ds/filter-picker.js';
import { Icon } from './ds/icon.js';
import type { BotHarnessTranslate } from './locale.js';
import { modelBrand, ModelBrandIcon, modelShortName } from './model-brand.js';
import { restingHint, routingGroupEngineCopy } from './model-menu.js';
import { useMountedResource } from './mounted-resource.js';
import { engineName, ENGINE_MARKER_ICON } from './session-engine.js';

export function routingGroupMemberKey(member: RoutingGroupMemberView): string {
  switch (member.kind) {
    case 'group':
      return `group:${member.id}`;
    case 'engine':
      return `engine:${JSON.stringify([member.engine, member.model ?? ''])}`;
    case 'model':
      return `model:${JSON.stringify([member.provider, member.model, member.reasoningEffort ?? ''])}`;
  }
}

export function RoutingGroupMemberPicker({
  models,
  groups,
  members,
  selfId,
  loadEngines,
  onSelect,
  t,
}: {
  models: readonly ModelCatalogEntryView[];
  groups: readonly RoutingGroupView[];
  members: readonly RoutingGroupMemberView[];
  selfId: string | undefined;
  loadEngines(): Promise<RoutingGroupEngineOptions[]>;
  onSelect(member: RoutingGroupMemberView): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const taken = new Set(members.map(routingGroupMemberKey));
  const anchor = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const [engines, setEngines] = useState<RoutingGroupEngineOptions[]>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!picking) return;
    let active = true;
    void loadEngines().then(
      (options) => {
        if (active) setEngines(options);
      },
      () => {
        if (active) setEngines([]);
      },
    );
    return () => {
      active = false;
    };
  }, [loadEngines, picking]);
  const togglePicker = () => {
    if (!picking) setEngines(undefined);
    setPicking(!picking);
  };
  const choices = new Map<string, RoutingGroupMemberView>();
  const options: FilterPickerOption[] = [];
  if (picking) {
    for (const entry of models) {
      const { provider, model, modelName, providerName, credential, restingUntil } = entry;
      const member: RoutingGroupMemberView = { kind: 'model', provider, model };
      const value = routingGroupMemberKey(member);
      if (taken.has(value)) continue;
      const brand = modelBrand({ provider, model, name: modelName });
      const hint =
        credential !== undefined
          ? t(
              credential === 'missing'
                ? 'modelPreset.credentialMissing'
                : 'modelPreset.credentialInvalid',
              { provider: providerName },
            )
          : restingUntil === undefined
            ? providerName
            : `${providerName} · ${restingHint(restingUntil, t)}`;
      choices.set(value, member);
      options.push({
        value,
        label: modelShortName(modelName, brand),
        name: modelName,
        hint,
        icon: <ModelBrandIcon brand={brand} size={16} />,
        filter: 'models',
      });
    }
    for (const group of groups) {
      const member: RoutingGroupMemberView = { kind: 'group', id: group.id };
      const value = routingGroupMemberKey(member);
      if (group.id === selfId || taken.has(value)) continue;
      choices.set(value, member);
      options.push({
        value,
        label: group.name,
        hint: t('routingGroups.groupTag'),
        icon: <Icon name="git-branch" size={16} />,
        filter: 'groups',
      });
    }
    for (const { member, status, modelName } of routingGroupEngineChoices(engines ?? [])) {
      const value = routingGroupMemberKey(member);
      if (status.available && taken.has(value)) continue;
      const row = routingGroupEnginePresentation(member, routingGroupEngineCopy(t), modelName);
      const reason = status.available
        ? undefined
        : {
            'host-not-local': () => t('engine.localOnly'),
            'not-installed': () => t('engine.notInstalled', { engine: engineName(member.engine) }),
            'signed-out': () => t('engine.signInLabel', { engine: engineName(member.engine) }),
            'not-subscription': () => t('engine.notSubscription'),
            'login-unknown': () => t('engine.loginUnknown'),
          }[status.reason]();
      choices.set(value, member);
      options.push({
        value,
        label: row.title,
        name: row.name,
        hint: reason === undefined ? row.detail : `${row.detail} · ${reason}`,
        icon: <ModelBrandIcon brand={row.brand} size={16} />,
        marker: <Icon name={ENGINE_MARKER_ICON} size={12} />,
        filter: 'engines',
        exclusive: true,
        disabled: !status.available,
      });
    }
    if (engines === undefined || engines.length === 0) {
      options.push({
        value: 'engines-status',
        label: t(
          engines !== undefined ? 'routingGroups.enginesUnavailable' : 'modelPreset.loading',
        ),
        disabled: true,
        filter: 'engines',
        exclusive: true,
      });
    }
  }
  return (
    <div ref={mount}>
      <Button
        ref={anchor}
        type="button"
        variant="outline"
        size="sm"
        onClick={togglePicker}
        aria-haspopup="dialog"
        aria-expanded={picking}
      >
        <Icon name="plus" size={16} />
        {t('routingGroups.add')}
      </Button>
      {picking ? (
        <FilterPicker
          label={t('routingGroups.add')}
          options={options}
          value=""
          closeOnSelect
          onSelect={(key) => {
            const member = choices.get(key);
            if (member !== undefined) onSelect(member);
          }}
          filters={[
            {
              key: 'models',
              label: t('routingGroups.models'),
              icon: <Icon name="cpu" size={16} />,
            },
            {
              key: 'groups',
              label: t('routingGroups.title'),
              icon: <Icon name="git-branch" size={16} />,
            },
            {
              key: 'engines',
              label: t('routingGroups.engines'),
              icon: <Icon name={ENGINE_MARKER_ICON} size={16} />,
            },
          ]}
          allFilter={{
            key: 'all',
            label: t('modelMenu.all'),
            icon: <Icon name="layers-2" size={16} />,
          }}
          filtersLabel={t('modelMenu.families')}
          searchLabel={t('modelMenu.search')}
          emptyLabel={t('modelPreset.noMatch')}
          anchorRef={anchor}
          portalContainer={anchor.current?.closest('[aria-modal="true"]') ?? null}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
