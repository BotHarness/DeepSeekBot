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
}

export type ModelChoice =
  | { kind: 'model'; provider: string; model: string }
  | { kind: 'group'; id: string };

export interface ModelCatalogAnswer {
  models: ModelCatalogEntry[];
  default?: ModelCatalogRoute;
  defaultRevision?: number;
  favorites?: ModelChoice[];
}

export function modelChoice(value: unknown): ModelChoice | undefined {
  const row = record(value);
  if (row === undefined) return undefined;
  if (row['kind'] === 'group')
    return filled(row['id']) ? { kind: 'group', id: row['id'] } : undefined;
  return row['kind'] === 'model' && filled(row['provider']) && filled(row['model'])
    ? { kind: 'model', provider: row['provider'], model: row['model'] }
    : undefined;
}

export function modelChoiceKey(choice: ModelChoice): string {
  return choice.kind === 'group'
    ? `group:${choice.id}`
    : JSON.stringify([choice.provider, choice.model]);
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
  };
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
    ...(Array.isArray(answer?.['favorites'])
      ? {
          favorites: answer['favorites'].flatMap((value) => {
            const choice = modelChoice(value);
            return choice === undefined ? [] : [choice];
          }),
        }
      : {}),
  };
}
