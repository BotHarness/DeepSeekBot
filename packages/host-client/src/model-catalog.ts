import {
  ENGINE_DEFINITIONS,
  ENGINE_IDS,
  ROUTING_GROUP_ENGINE_UNAVAILABLE_REASONS,
  engineEffortName,
  isEngineId,
  isRoutingGroupEngineMember,
  type EngineId,
  type RoutingGroupEngineModel,
  type RoutingGroupEngineMember,
  type RoutingGroupEngineOptions,
} from '@botharness/host-protocol/subscription-engine';

import type { HostCall } from './host-answer';
import { modelBrand, modelShortName } from './shared/model-brand';

export interface ModelCatalogRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface ModelCatalogEntry {
  provider: string;
  providerName: string;
  model: string;
  modelName: string;
  efforts?: { id: string; name: string }[];
  defaultEffort?: string;
  credential?: 'missing' | 'invalid';
  restingUntil?: string;
}

export function modelEffortChoices(entry: Pick<ModelCatalogEntry, 'efforts' | 'defaultEffort'>) {
  const ids = ['', ...(entry.efforts ?? []).map((effort) => effort.id)];
  const allowedEfforts = [...new Set(ids)].slice(0, 16);
  const preferred = entry.defaultEffort ?? '';
  return {
    allowedEfforts,
    defaultEffort: allowedEfforts.includes(preferred) ? preferred : '',
  };
}

export interface ModelCatalogGroup {
  id: string;
  name: string;
  revision: number;
  routes: ModelCatalogRoute[];
  members?: RoutingGroupMember[];
  restingUntil?: string;
}

export interface RoutingGroupEngineCopy {
  defaultModel(engine: string): string;
  subscription(source: string): string;
  effort?: Parameters<typeof engineEffortName>[1];
}

export function routingGroupEnginePresentation(
  member: RoutingGroupEngineMember,
  copy: RoutingGroupEngineCopy,
  modelName?: string,
  accountName?: string,
) {
  const engineName = ENGINE_DEFINITIONS[member.engine].displayName;
  const brand =
    modelBrand({ model: member.model, name: modelName }) ??
    (member.engine === 'codex' ? 'openai' : 'claude');
  const name =
    member.model === undefined
      ? copy.defaultModel(engineName)
      : (modelName ??
        member.model.replace(
          /^gpt(-[0-9.]+)(?:-([a-z]+))?$/iu,
          (_id: string, version: string, variant: string | undefined) =>
            `GPT${version}${variant === undefined ? '' : `-${variant.charAt(0).toUpperCase()}${variant.slice(1)}`}`,
        ));
  const short = member.model === undefined ? name : modelShortName(name, brand);
  return {
    brand,
    title: /^[0-9]|^$/u.test(short) ? name : short,
    name,
    detail: [
      engineName,
      accountName === engineName ? undefined : accountName,
      copy.subscription(member.engine === 'codex' ? 'ChatGPT' : 'Claude'),
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

export function routingGroupEngineChoices(engines: readonly RoutingGroupEngineOptions[]) {
  return engines.flatMap((status) => {
    if (!status.available) return [];
    const defaultModel = status.models.find((model) => model.isDefault);
    return status.models.map((model) => ({
      member: {
        kind: 'engine',
        engine: status.engine,
        ...(status.accountId === undefined ? {} : { accountId: status.accountId }),
        model: model.id,
      } satisfies RoutingGroupEngineMember,
      model,
      accountName: status.accountName,
      isDefault: model === defaultModel,
    }));
  });
}

function findEngineModel(models: readonly RoutingGroupEngineModel[], id: string) {
  return (
    models.find((model) => model.id === id) ?? models.find((model) => model.aliases?.includes(id))
  );
}

export function engineCatalogModel(
  engines: readonly RoutingGroupEngineOptions[],
  target: { engine: EngineId; model: string; account?: string },
): RoutingGroupEngineModel | undefined {
  const options = engines
    .filter((status) => status.available)
    .filter((status) => status.engine === target.engine);
  const preferred =
    target.account === undefined
      ? undefined
      : (options.find((status) => status.accountId === target.account) ??
        options.find((status) => status.accountName === target.account));
  const models = options.flatMap((status) => status.models);
  const exact =
    findEngineModel(preferred?.models ?? [], target.model) ?? findEngineModel(models, target.model);
  if (exact !== undefined) return exact;

  const normalize = (id: string) => {
    const key = id
      .toLowerCase()
      .trim()
      .replace(/[\s._-]+/gu, '-');
    return target.engine === 'claude' ? key.replace(/^claude-/u, '') : key;
  };
  const key = normalize(target.model);
  const matches = (model: RoutingGroupEngineModel) =>
    normalize(model.id) === key || model.aliases?.some((alias) => normalize(alias) === key);
  return preferred?.models.find(matches) ?? models.find(matches);
}

export function routingGroupEngineMemberRow(
  member: RoutingGroupEngineMember,
  status: RoutingGroupEngineOptions | undefined,
  copy: RoutingGroupEngineCopy,
) {
  const defaults = status?.available ? status.models.find((model) => model.isDefault) : undefined;
  const model =
    member.model === undefined
      ? defaults
      : status?.available
        ? findEngineModel(status.models, member.model)
        : undefined;
  const shown = model === undefined ? member : { ...member, model: model.id };
  const effort = member.reasoningEffort;
  const catalogName = model?.efforts.find((item) => item.id === effort)?.name;
  const row = routingGroupEnginePresentation(shown, copy, model?.name, status?.accountName);
  return {
    ...row,
    detail: [
      row.detail,
      effort === undefined ? undefined : engineEffortName(effort, copy.effort, catalogName),
    ]
      .filter(Boolean)
      .join(' · '),
    isDefault: model !== undefined && model === defaults,
    unavailable: status?.available === true && model === undefined,
  };
}

export async function loadRoutingGroupEngines(
  host: HostCall,
): Promise<RoutingGroupEngineOptions[]> {
  return parseRoutingGroupEngines(
    await host.call('modelCatalog', { includeRoutingGroupEngines: true }),
  );
}

export async function loadSessionModelCatalog(host: HostCall) {
  const answer = await host.call('modelCatalog', { includeRoutingGroupEngines: true });
  return { ...parseModelCatalog(answer), engines: parseRoutingGroupEngines(answer) };
}

function parseRoutingGroupEngines(value: unknown): RoutingGroupEngineOptions[] {
  const rows = record(value)?.['routingGroupEngines'];
  if (!Array.isArray(rows)) return [];
  const statuses = rows.flatMap((value): RoutingGroupEngineOptions[] => {
    const row = record(value);
    const engine = row?.['engine'];
    if (!isEngineId(engine)) return [];
    const base = {
      engine,
      ...(filled(row?.['accountId']) ? { accountId: row['accountId'] } : {}),
      ...(filled(row?.['accountName']) ? { accountName: row['accountName'] } : {}),
    };
    if (row?.['available'] === true) {
      const models = Array.isArray(row['models'])
        ? row['models'].flatMap((value) => {
            const model = record(value);
            const id = model?.['id'];
            const name = model?.['name'];
            if (!filled(id) || !filled(name) || model === undefined) return [];
            const defaultEffort = model['defaultEffort'];
            const aliases = Array.isArray(model['aliases']) ? model['aliases'].filter(filled) : [];
            return [
              {
                id,
                name,
                efforts: catalogEfforts(model['efforts']) ?? [],
                ...(filled(defaultEffort) ? { defaultEffort } : {}),
                ...(model['isDefault'] === true ? { isDefault: true } : {}),
                ...(aliases.length === 0 ? {} : { aliases }),
              } satisfies RoutingGroupEngineModel,
            ];
          })
        : [];
      return [{ ...base, available: true, models }];
    }
    const reason = ROUTING_GROUP_ENGINE_UNAVAILABLE_REASONS.find(
      (reason) => reason === row?.['reason'],
    );
    return reason === undefined ? [] : [{ ...base, available: false, reason }];
  });
  return ENGINE_IDS.flatMap((engine) => statuses.filter((status) => status.engine === engine));
}

export type RoutingGroupMember =
  | ({ kind: 'model' } & ModelCatalogRoute)
  | { kind: 'group'; id: string }
  | RoutingGroupEngineMember;

export type RoutingGroup = Pick<ModelCatalogGroup, 'id' | 'name' | 'revision'> & {
  members: RoutingGroupMember[];
};

export function parseRoutingGroup(value: unknown): RoutingGroup | undefined {
  const row = record(value);
  const id = row?.['id'];
  const name = row?.['name'];
  const revision = row?.['revision'];
  const rows = row?.['members'];
  if (
    !filled(id) ||
    !filled(name) ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !Array.isArray(rows)
  )
    return undefined;
  const members = rows.map(parseRoutingGroupMember);
  return members.every((member) => member !== undefined)
    ? { id, name, revision, members }
    : undefined;
}

function parseRoutingGroupMember(value: unknown): RoutingGroupMember | undefined {
  if (isRoutingGroupEngineMember(value)) return value;
  const member = record(value);
  if (member?.['kind'] === 'group' && filled(member['id']))
    return { kind: 'group', id: member['id'] };
  const route = member?.['kind'] === 'model' ? catalogRoute(member) : undefined;
  return route === undefined ? undefined : { kind: 'model', ...route };
}

export function modelCatalogGroupMemberLabels(
  group: ModelCatalogGroup,
  models: readonly ModelCatalogEntry[],
  groups: readonly ModelCatalogGroup[],
  copy: RoutingGroupEngineCopy,
  engines?: readonly RoutingGroupEngineOptions[],
): string[] {
  return (group.members ?? group.routes.map((route) => ({ kind: 'model' as const, ...route }))).map(
    (member) => {
      switch (member.kind) {
        case 'group':
          return groups.find((group) => group.id === member.id)?.name ?? member.id;
        case 'engine': {
          const status = engines?.find(
            (option) => option.engine === member.engine && option.accountId === member.accountId,
          );
          const model = member.model;
          const entry =
            model === undefined || engines === undefined
              ? undefined
              : engineCatalogModel(status === undefined ? engines : [status], {
                  engine: member.engine,
                  model,
                });
          const row = routingGroupEnginePresentation(
            member,
            copy,
            entry?.name,
            status?.accountName,
          );
          return `${row.name} · ${row.detail}`;
        }
        case 'model': {
          const entry = models.find(
            (model) => model.provider === member.provider && model.model === member.model,
          );
          return entry === undefined
            ? `${member.provider}/${member.model}`
            : `${entry.modelName} · ${entry.providerName}`;
        }
      }
    },
  );
}

export type ModelChoice =
  | { kind: 'model'; provider: string; model: string }
  | { kind: 'group'; id: string }
  | { kind: 'preset'; id: string };

export interface ModelCatalogAnswer {
  models: ModelCatalogEntry[];
  default?: ModelCatalogRoute;
  defaultRevision?: number;
  defaultGroupId?: string;
  defaultGroupEffort?: string;
  defaultGroupRevision?: number;
  favorites?: ModelChoice[];
  groups?: ModelCatalogGroup[];
}

export function modelChoice(value: unknown): ModelChoice | undefined {
  const row = record(value);
  if (row === undefined) return undefined;
  if (row['kind'] === 'group' || row['kind'] === 'preset')
    return filled(row['id']) ? { kind: row['kind'], id: row['id'] } : undefined;
  return row['kind'] === 'model' && filled(row['provider']) && filled(row['model'])
    ? { kind: 'model', provider: row['provider'], model: row['model'] }
    : undefined;
}

export function modelChoiceKey(choice: ModelChoice): string {
  return choice.kind === 'model'
    ? JSON.stringify([choice.provider, choice.model])
    : `${choice.kind}:${choice.id}`;
}

export interface ModelFavoriteChange {
  choice: ModelChoice;
  favorite: boolean;
}

export function applyModelFavoriteChanges(
  confirmed: readonly ModelChoice[],
  changes: readonly ModelFavoriteChange[],
): ModelChoice[] {
  return changes.reduce<ModelChoice[]>(
    (list, change) => {
      const key = modelChoiceKey(change.choice);
      const rest = list.filter((entry) => modelChoiceKey(entry) !== key);
      return change.favorite ? [...rest, change.choice] : rest;
    },
    [...confirmed],
  );
}

export function serialWrites<A extends unknown[], T>(
  write: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (...args) => {
    const run = tail.then(() => write(...args));
    tail = run.catch(() => undefined);
    return run;
  };
}

export class ModelCatalogInvalid extends Error {}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function catalogEfforts(value: unknown): ModelCatalogEntry['efforts'] {
  return Array.isArray(value)
    ? value.flatMap((raw) => {
        const effort = record(raw);
        const id = effort?.['id'];
        return typeof id === 'string'
          ? [{ id, name: filled(effort?.['name']) ? effort['name'] : id }]
          : [];
      })
    : undefined;
}

export function modelCatalogEntry(value: unknown): ModelCatalogEntry | undefined {
  const row = record(value);
  const provider = row?.['provider'];
  const model = row?.['model'];
  if (row === undefined || !filled(provider) || !filled(model)) return undefined;
  const credential = row['credential'];
  const efforts = catalogEfforts(row['efforts']);
  return {
    provider,
    providerName: filled(row['providerName']) ? row['providerName'] : provider,
    model,
    modelName: filled(row['modelName']) ? row['modelName'] : model,
    ...(efforts === undefined ? {} : { efforts }),
    ...(filled(row['defaultEffort']) ? { defaultEffort: row['defaultEffort'] } : {}),
    ...(credential === 'missing' || credential === 'invalid' ? { credential } : {}),
    ...(filled(row['restingUntil']) ? { restingUntil: row['restingUntil'] } : {}),
  };
}

export function modelCatalogGroup(value: unknown): ModelCatalogGroup | undefined {
  const row = record(value);
  const id = row?.['id'];
  const revision = row?.['revision'];
  if (row === undefined || !filled(id) || !Array.isArray(row['routes'])) return undefined;
  const routes = row['routes'].flatMap((route) => {
    const parsed = catalogRoute(route);
    return parsed === undefined ? [] : [parsed];
  });
  if (routes.length === 0) return undefined;
  const rawMembers = row['members'];
  const members = Array.isArray(rawMembers)
    ? rawMembers.flatMap((member) => parseRoutingGroupMember(member) ?? [])
    : [];
  return {
    id,
    name: filled(row['name']) ? row['name'] : id,
    revision: typeof revision === 'number' && Number.isSafeInteger(revision) ? revision : 0,
    routes,
    ...(members.length === 0 ? {} : { members }),
    ...(filled(row['restingUntil']) ? { restingUntil: row['restingUntil'] } : {}),
  };
}

export function modelCatalogGroupFront(
  group: ModelCatalogGroup,
  models: readonly ModelCatalogEntry[],
): ModelCatalogRoute {
  const resting = (route: ModelCatalogRoute) =>
    models.some(
      (entry) =>
        entry.provider === route.provider &&
        entry.model === route.model &&
        (entry.restingUntil !== undefined || entry.credential !== undefined),
    );
  return group.routes.find((route) => !resting(route)) ?? group.routes[0]!;
}

export function modelCatalogGroupEfforts(
  group: Pick<ModelCatalogGroup, 'routes'>,
  models: readonly ModelCatalogEntry[],
): { id: string; name: string }[] {
  const lists = group.routes
    .map(
      (route) =>
        models
          .find((entry) => entry.provider === route.provider && entry.model === route.model)
          ?.efforts?.filter((effort) => effort.id !== '') ?? [],
    )
    .filter((list) => list.length > 0);
  const [first, ...rest] = lists;
  return (first ?? []).filter((effort) =>
    rest.every((list) => list.some((item) => item.id === effort.id)),
  );
}

function catalogRoute(value: unknown): ModelCatalogRoute | undefined {
  const row = record(value);
  const provider = row?.['provider'];
  const model = row?.['model'];
  if (!filled(provider) || !filled(model)) return undefined;
  return {
    provider,
    model,
    ...(filled(row?.['reasoningEffort']) ? { reasoningEffort: row['reasoningEffort'] } : {}),
  };
}

export function parseModelCatalog(value: unknown): ModelCatalogAnswer {
  const answer = record(value);
  const rows = answer?.['models'];
  if (!Array.isArray(rows)) throw new ModelCatalogInvalid('modelCatalog returned no models.');
  const fallback = catalogRoute(answer?.['default']);
  const defaultRevision = answer?.['defaultRevision'];
  const defaultGroupRevision = answer?.['defaultGroupRevision'];
  return {
    models: rows.flatMap((row) => {
      const entry = modelCatalogEntry(row);
      return entry === undefined ? [] : [entry];
    }),
    ...(fallback === undefined ? {} : { default: fallback }),
    ...(typeof defaultRevision === 'number' &&
    Number.isSafeInteger(defaultRevision) &&
    defaultRevision >= 0
      ? { defaultRevision }
      : {}),
    ...(typeof answer?.['defaultGroupId'] === 'string'
      ? { defaultGroupId: answer['defaultGroupId'] }
      : {}),
    ...(typeof answer?.['defaultGroupId'] === 'string' &&
    typeof answer['defaultGroupEffort'] === 'string' &&
    answer['defaultGroupEffort'] !== ''
      ? { defaultGroupEffort: answer['defaultGroupEffort'] }
      : {}),
    ...(typeof defaultGroupRevision === 'number' &&
    Number.isSafeInteger(defaultGroupRevision) &&
    defaultGroupRevision >= 0
      ? { defaultGroupRevision }
      : {}),
    ...(Array.isArray(answer?.['favorites'])
      ? {
          favorites: answer['favorites'].flatMap((value) => {
            const choice = modelChoice(value);
            return choice === undefined ? [] : [choice];
          }),
        }
      : {}),
    ...(Array.isArray(answer?.['groups'])
      ? {
          groups: answer['groups'].flatMap((value) => {
            const group = modelCatalogGroup(value);
            return group === undefined ? [] : [group];
          }),
        }
      : {}),
  };
}
