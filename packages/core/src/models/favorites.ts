import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';

export const MODEL_FAVORITES_MAX = 64;

export interface ModelFavoriteModel {
  kind: 'model';
  provider: string;
  model: string;
}

export interface ModelFavoriteGroup {
  kind: 'group';
  id: string;
}

export interface ModelFavoritePreset {
  kind: 'preset';
  id: string;
}

export type ModelFavorite = ModelFavoriteModel | ModelFavoriteGroup | ModelFavoritePreset;

export interface ModelFavoriteStore {
  list(humanId: string): ModelFavorite[];
  set(humanId: string, favorite: ModelFavorite, on: boolean): ModelFavorite[];
}

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function modelFavorite(value: unknown): ModelFavorite | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row['kind'] === 'group' || row['kind'] === 'preset')
    return filled(row['id']) ? { kind: row['kind'], id: row['id'].trim() } : undefined;
  if (row['kind'] !== 'model' || !filled(row['provider']) || !filled(row['model']))
    return undefined;
  return { kind: 'model', provider: row['provider'].trim(), model: row['model'].trim() };
}

export function modelFavoriteKey(favorite: ModelFavorite): string {
  return favorite.kind !== 'model'
    ? JSON.stringify([favorite.kind, favorite.id])
    : JSON.stringify([favorite.kind, favorite.provider, favorite.model]);
}

export function createModelFavoriteStore(options: {
  database: OperationalDatabaseOwner;
}): ModelFavoriteStore {
  const port = attachOperationalModule(options.database, 'model-favorites');
  const list = (humanId: string): ModelFavorite[] =>
    port.read((database) =>
      database
        .prepare(
          'SELECT favorite_json FROM human_model_favorites WHERE human_id = ? ORDER BY position, favorite_key',
        )
        .all(humanId)
        .flatMap((row) => {
          const favorite = modelFavorite(JSON.parse(String(row['favorite_json'])));
          return favorite === undefined ? [] : [favorite];
        }),
    );
  return {
    list,
    set(humanId, favorite, on) {
      const key = modelFavoriteKey(favorite);
      port.transaction(
        (database) => {
          if (!on) {
            database
              .prepare('DELETE FROM human_model_favorites WHERE human_id = ? AND favorite_key = ?')
              .run(humanId, key);
            return;
          }
          if (
            database
              .prepare(
                'SELECT 1 FROM human_model_favorites WHERE human_id = ? AND favorite_key = ?',
              )
              .get(humanId, key)
          )
            return;
          const count = Number(
            database
              .prepare('SELECT COUNT(*) AS count FROM human_model_favorites WHERE human_id = ?')
              .get(humanId)?.['count'] ?? 0,
          );
          if (count >= MODEL_FAVORITES_MAX)
            throw new Error(`A Human can keep at most ${MODEL_FAVORITES_MAX} favorite models.`);
          database
            .prepare(
              `INSERT INTO human_model_favorites (human_id, favorite_key, favorite_json, position)
               VALUES (?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM human_model_favorites WHERE human_id = ?), 0))`,
            )
            .run(humanId, key, JSON.stringify(favorite), humanId);
        },
        ['model-favorites'],
      );
      return list(humanId);
    },
  };
}
