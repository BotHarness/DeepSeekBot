import {
  ENGINE_DEFINITIONS,
  isRoutingGroupEngineMember,
  type RoutingGroupEngineMember,
} from '@botharness/host-protocol/subscription-engine';

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
  engineMembers?: RoutingGroupEngineMember[];
  restingUntil?: string;
}

export function routingGroupEngineLabel(member: RoutingGroupEngineMember): string {
  const name = ENGINE_DEFINITIONS[member.engine].displayName;
  return member.model === undefined ? name : `${name} (${member.model})`;
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
  const members: RoutingGroupMember[] = [];
  for (const value of rows) {
    if (isRoutingGroupEngineMember(value)) {
      members.push(value);
      continue;
    }
    const member = record(value);
    if (member?.['kind'] === 'group' && filled(member['id'])) {
      members.push({ kind: 'group', id: member['id'] });
      continue;
    }
    const route = member?.['kind'] === 'model' ? catalogRoute(member) : undefined;
    if (route === undefined) return undefined;
    members.push({ kind: 'model', ...route });
  }
  return { id, name, revision, members };
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

export function modelCatalogEntry(value: unknown): ModelCatalogEntry | undefined {
  const row = record(value);
  const provider = row?.['provider'];
  const model = row?.['model'];
  if (row === undefined || !filled(provider) || !filled(model)) return undefined;
  const credential = row['credential'];
  return {
    provider,
    providerName: filled(row['providerName']) ? row['providerName'] : provider,
    model,
    modelName: filled(row['modelName']) ? row['modelName'] : model,
    ...(Array.isArray(row['efforts'])
      ? {
          efforts: row['efforts'].flatMap((value) => {
            const effort = record(value);
            const id = effort?.['id'];
            return typeof id === 'string'
              ? [{ id, name: filled(effort?.['name']) ? effort['name'] : id }]
              : [];
          }),
        }
      : {}),
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
  const members = row['members'];
  const engineMembers = Array.isArray(members) ? members.filter(isRoutingGroupEngineMember) : [];
  return {
    id,
    name: filled(row['name']) ? row['name'] : id,
    revision: typeof revision === 'number' && Number.isSafeInteger(revision) ? revision : 0,
    routes,
    ...(engineMembers.length === 0 ? {} : { engineMembers }),
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
