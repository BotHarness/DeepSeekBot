import { turnTargetLabel } from '@botharness/host-client/turn-target';
import { MODEL_BRAND_ICONS, type ModelBrand } from '@botharness/host-client/shared/model-brand';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';

import type { SessionModelCatalog } from '../../host/session-model-query';
import { sessionDefaultModel, sessionModelKey } from './session-model-label';

export type SessionModelSource = 'default' | 'sub' | 'api' | 'group' | 'preset';
export type SessionModelMode = 'session' | 'slot';
export const GROUP_FILTER = 'groups';

export interface SessionModelRow {
  key: string;
  choice: SessionModelChoice | null;
  name: string;
  source: SessionModelSource;
  brand?: ModelBrand | undefined;
  detail?: string | undefined;
  tag?: string | undefined;
  disabled?: boolean | undefined;
  filters?: readonly string[] | undefined;
}

export type SessionModelSectionId = 'default' | 'presets' | 'subs' | 'api' | 'groups';

export interface SessionModelSection {
  id: SessionModelSectionId;
  title: string;
  rows: SessionModelRow[];
}

export interface SessionModelFilter {
  key: string;
  brand: ModelBrand | undefined;
  source: 'sub' | 'api' | 'group';
  title: string;
}

export interface SessionModelSkeletonSection {
  id: SessionModelSectionId;
  title: string;
  rows: number;
}

export interface SessionModelSectionStrings {
  defaultName: string;
  subscriptions: string;
  apiModels: string;
  groups: string;
  api: string;
  sub: string;
  other: string;
}

export const SKELETON_SUB_ROWS = 3;
export const SKELETON_API_ROWS = 6;
export const SKELETON_GROUP_ROWS = 2;

export function catalogDefaultChoice(
  catalog: SessionModelCatalog | undefined,
): SessionModelChoice | null {
  if (catalog === undefined) return null;
  if (
    catalog.defaultGroupId !== undefined &&
    (catalog.groups ?? []).some((group) => group.id === catalog.defaultGroupId)
  )
    return { kind: 'group', id: catalog.defaultGroupId };
  const route = catalog.default;
  return route === undefined
    ? null
    : { kind: 'model', provider: route.provider, model: route.model };
}

export function sessionModelSections({
  catalog,
  defaultChoice,
  native,
  strings,
  mode = 'session',
}: {
  catalog: SessionModelCatalog;
  defaultChoice: SessionModelChoice | null;
  native: boolean;
  strings: SessionModelSectionStrings;
  mode?: SessionModelMode;
}): SessionModelSection[] {
  const slot = mode === 'slot';
  const fallback = sessionDefaultModel(defaultChoice, catalog);
  const subs = (native ? [] : catalog.engines).flatMap((engine): SessionModelRow[] =>
    engine.available
      ? engine.models.map((model) => {
          const label = turnTargetLabel(
            {
              kind: 'engine',
              engine: engine.engine,
              model: model.id,
              ...(engine.accountId === undefined ? {} : { account: engine.accountId }),
            },
            catalog,
          );
          const choice: SessionModelChoice = {
            kind: 'engine',
            engine: engine.engine,
            model: model.id,
            ...(engine.accountId === undefined ? {} : { accountId: engine.accountId }),
            ...(model.defaultEffort ? { effort: model.defaultEffort } : {}),
          };
          return {
            key: sessionModelKey(choice),
            choice,
            name: label.short,
            source: 'sub',
            brand: label.brand,
            detail: engine.accountName,
            tag: strings.sub,
          };
        })
      : [],
  );
  const api = catalog.models.map((model): SessionModelRow => {
    const label = turnTargetLabel(
      { kind: 'dsh', provider: model.provider, model: model.model },
      catalog,
    );
    const choice: SessionModelChoice = {
      kind: 'model',
      provider: model.provider,
      model: model.model,
    };
    return {
      key: sessionModelKey(choice),
      choice,
      name: label.short,
      source: 'api',
      brand: label.brand,
      detail: model.providerName,
      tag: strings.api,
      disabled: model.credential !== undefined || model.restingUntil !== undefined,
    };
  });
  const groups = (native && !slot ? [] : (catalog.groups ?? [])).map((group): SessionModelRow => {
    const choice: SessionModelChoice = { kind: 'group', id: group.id };
    const filters = new Set<string>();
    for (const route of group.routes)
      filters.add(
        filterKey(
          'api',
          turnTargetLabel({ kind: 'dsh', provider: route.provider, model: route.model }, catalog)
            .brand,
        ),
      );
    for (const member of group.members ?? [])
      if (member.kind === 'engine')
        filters.add(
          filterKey(
            'sub',
            turnTargetLabel(
              { kind: 'engine', engine: member.engine, model: member.model ?? '' },
              catalog,
            ).brand,
          ),
        );
    return {
      key: sessionModelKey(choice),
      choice,
      name: group.name,
      source: 'group',
      disabled: group.restingUntil !== undefined,
      ...(slot
        ? {
            detail: group.routes
              .map(
                (route) =>
                  turnTargetLabel(
                    { kind: 'dsh', provider: route.provider, model: route.model },
                    catalog,
                  ).short,
              )
              .join(' → '),
            filters: [...filters],
          }
        : {}),
    };
  });
  return [
    {
      id: 'default',
      title: '',
      rows: [
        {
          key: sessionModelKey(null),
          choice: null,
          name: strings.defaultName,
          source: 'default',
          ...fallback,
        },
      ],
    },
    ...(slot ? [{ id: 'groups' as const, title: strings.groups, rows: groups }] : []),
    { id: 'subs', title: strings.subscriptions, rows: subs },
    { id: 'api', title: strings.apiModels, rows: api },
    ...(slot ? [] : [{ id: 'groups' as const, title: strings.groups, rows: groups }]),
  ];
}

const filterKey = (source: 'sub' | 'api', brand: ModelBrand | undefined) =>
  `${source}:${brand ?? 'other'}`;

export function sessionModelFilters(
  sections: readonly SessionModelSection[],
  other: string,
  groups?: string,
): SessionModelFilter[] {
  const order = Object.keys(MODEL_BRAND_ICONS) as ModelBrand[];
  const rank = (brand: ModelBrand | undefined) =>
    brand === undefined ? order.length : order.indexOf(brand);
  const seen = new Map<string, SessionModelFilter>();
  for (const section of sections)
    for (const row of section.rows) {
      if (row.source !== 'sub' && row.source !== 'api') continue;
      const key = filterKey(row.source, row.brand);
      if (seen.has(key)) continue;
      seen.set(key, {
        key,
        brand: row.brand,
        source: row.source,
        title: row.brand === undefined ? other : MODEL_BRAND_ICONS[row.brand].title,
      });
    }
  const filters = [...seen.values()];
  const hasGroups = sections.some((section) => section.rows.some((row) => row.source === 'group'));
  return [
    ...(groups !== undefined && hasGroups
      ? [{ key: GROUP_FILTER, brand: undefined, source: 'group' as const, title: groups }]
      : []),
    ...filters.filter((f) => f.source === 'sub').sort((a, b) => rank(a.brand) - rank(b.brand)),
    ...filters.filter((f) => f.source === 'api').sort((a, b) => rank(a.brand) - rank(b.brand)),
  ];
}

export function filterSessionModelSections(
  sections: readonly SessionModelSection[],
  filter: string | undefined,
): SessionModelSection[] {
  return sections
    .map((section) =>
      filter === undefined || section.id === 'default' || section.id === 'presets'
        ? section
        : {
            ...section,
            rows: section.rows.filter((row) =>
              filter === GROUP_FILTER
                ? row.source === 'group'
                : row.source === 'group'
                  ? row.filters?.includes(filter) === true
                  : (row.source === 'sub' || row.source === 'api') &&
                    filterKey(row.source, row.brand) === filter,
            ),
          },
    )
    .filter((section) => section.rows.length > 0);
}

export function sessionModelSkeleton(
  native: boolean,
  strings: Pick<SessionModelSectionStrings, 'subscriptions' | 'apiModels' | 'groups'>,
  mode: SessionModelMode = 'session',
): SessionModelSkeletonSection[] {
  if (mode === 'slot')
    return [
      { id: 'groups', title: strings.groups, rows: SKELETON_GROUP_ROWS },
      { id: 'subs', title: strings.subscriptions, rows: SKELETON_SUB_ROWS },
      { id: 'api', title: strings.apiModels, rows: SKELETON_API_ROWS },
    ];
  return [
    { id: 'default', title: '', rows: 1 },
    ...(native
      ? []
      : [{ id: 'subs' as const, title: strings.subscriptions, rows: SKELETON_SUB_ROWS }]),
    { id: 'api', title: strings.apiModels, rows: SKELETON_API_ROWS },
  ];
}

export interface SessionModelEffort {
  key: string;
  options: { id: string; name: string }[];
  current: string;
}

export function sessionModelEffort(
  catalog: SessionModelCatalog | undefined,
  choice: SessionModelChoice | null,
  name: (id: string, catalogName?: string) => string,
  defaultName: string,
): SessionModelEffort | undefined {
  if (catalog === undefined || choice === null || choice.kind === 'group') return undefined;
  const model =
    choice.kind === 'model'
      ? catalog.models.find(
          (entry) => entry.provider === choice.provider && entry.model === choice.model,
        )
      : catalog.engines
          .flatMap((engine) =>
            engine.available &&
            engine.engine === choice.engine &&
            (choice.accountId === undefined || engine.accountId === choice.accountId)
              ? engine.models
              : [],
          )
          .find((entry) => entry.id === choice.model);
  const efforts = model?.efforts ?? [];
  if (efforts.length < 2) return undefined;
  const fallback = efforts.find((effort) => effort.id === model?.defaultEffort);
  return {
    key: sessionModelKey(choice),
    current: efforts.find((effort) => effort.id === choice.effort)?.id ?? '',
    options: [
      {
        id: '',
        name:
          fallback === undefined
            ? defaultName
            : `${defaultName} · ${name(fallback.id, fallback.name)}`,
      },
      ...efforts.map((effort) => ({ id: effort.id, name: name(effort.id, effort.name) })),
    ],
  };
}
