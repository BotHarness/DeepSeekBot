import {
  sessionModelChoice,
  type SessionModelChoice,
} from '@botharness/host-protocol/session-model';

import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ModelRoute } from '../models/presets.js';
import type { RoutingTarget } from '../models/routing-groups.js';

export function sessionModelChoices(
  database: Pick<OperationalDatabaseModulePort, 'read' | 'transaction'>,
) {
  return {
    get(sessionId: string): SessionModelChoice | null {
      const row = database.read((db) =>
        db
          .prepare('SELECT choice_json FROM session_model_choices WHERE session_id = ?')
          .get(sessionId),
      );
      return typeof row?.choice_json === 'string'
        ? (sessionModelChoice(JSON.parse(row.choice_json)) ?? null)
        : null;
    },
    set(sessionId: string, choice: SessionModelChoice | null): void {
      database.transaction(
        (db) => {
          if (choice === null) {
            db.prepare('DELETE FROM session_model_choices WHERE session_id = ?').run(sessionId);
          } else {
            db.prepare(`
              INSERT INTO session_model_choices (session_id, choice_json) VALUES (?, ?)
              ON CONFLICT (session_id) DO UPDATE SET choice_json = excluded.choice_json
            `).run(sessionId, JSON.stringify(choice));
          }
        },
        ['session-model-choice:' + sessionId],
      );
    },
  };
}

export function directSessionTarget(
  choice: Exclude<SessionModelChoice, { kind: 'group' }>,
): RoutingTarget {
  if (choice.kind === 'engine') {
    const { engine, accountId, model, effort } = choice;
    return {
      kind: 'engine',
      engine,
      ...(accountId === undefined ? {} : { accountId }),
      model,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    };
  }
  const { provider, model, effort } = choice;
  return {
    kind: 'route',
    route: { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) },
  };
}

export function sessionRouteChoice(route: ModelRoute): SessionModelChoice {
  const { provider, model, reasoningEffort } = route;
  return {
    kind: 'model',
    provider,
    model,
    ...(reasoningEffort === undefined ? {} : { effort: reasoningEffort }),
  };
}
