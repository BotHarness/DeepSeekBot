import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { isModelRoute, type ModelRoute } from './presets.js';

export interface FallbackOverride {
  botSlug: string;
  groupId: string;
  route: ModelRoute;
}

export interface FallbackOverrideStore {
  get(sessionId: string): FallbackOverride | undefined;
  set(sessionId: string, override: FallbackOverride): void;
  delete(sessionId: string): void;
}

export function createMemoryFallbackOverrides(): FallbackOverrideStore {
  const overrides = new Map<string, FallbackOverride>();
  return {
    get: (sessionId) => overrides.get(sessionId),
    set: (sessionId, override) => void overrides.set(sessionId, override),
    delete: (sessionId) => void overrides.delete(sessionId),
  };
}

export function createFallbackOverrideStore(options: {
  database: OperationalDatabaseOwner;
  now?: () => Date;
}): FallbackOverrideStore {
  const port = attachOperationalModule(options.database, 'routing-groups');
  const now = options.now ?? (() => new Date());
  return {
    get(sessionId) {
      const row = port.read((database) =>
        database
          .prepare(
            'SELECT bot_slug, group_id, route_json FROM group_fallback_overrides WHERE session_id = ?',
          )
          .get(sessionId),
      );
      if (row === undefined) return undefined;
      let route: unknown;
      try {
        route = JSON.parse(String(row['route_json']));
      } catch {
        return undefined;
      }
      if (!isModelRoute(route)) return undefined;
      return { botSlug: String(row['bot_slug']), groupId: String(row['group_id']), route };
    },
    set(sessionId, override) {
      port.transaction(
        (database) => {
          database
            .prepare(
              `INSERT INTO group_fallback_overrides (session_id, bot_slug, group_id, route_json, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (session_id) DO UPDATE SET bot_slug = excluded.bot_slug,
                 group_id = excluded.group_id, route_json = excluded.route_json,
                 updated_at = excluded.updated_at`,
            )
            .run(
              sessionId,
              override.botSlug,
              override.groupId,
              JSON.stringify(override.route),
              now().toISOString(),
            );
        },
        ['routing-groups'],
      );
    },
    delete(sessionId) {
      port.transaction(
        (database) => {
          database
            .prepare('DELETE FROM group_fallback_overrides WHERE session_id = ?')
            .run(sessionId);
        },
        ['routing-groups'],
      );
    },
  };
}
