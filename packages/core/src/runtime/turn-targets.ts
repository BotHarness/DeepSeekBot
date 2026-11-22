import { isTurnTarget, type TurnTarget } from '@botharness/host-protocol/turn-target';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const TURN_TARGET_TOPIC = 'session-turn-target:';

export interface TurnTargetSegment {
  turn: number;
  step: number;
  request: string;
  target: TurnTarget;
}

function parseTarget(json: unknown): TurnTarget | undefined {
  if (typeof json !== 'string') return undefined;
  const value: unknown = JSON.parse(json);
  return isTurnTarget(value) ? value : undefined;
}

export function readTurnTargets(
  database: Pick<OperationalDatabaseModulePort, 'read'>,
  sessionId: string,
): TurnTargetSegment[] {
  return database.read((db) =>
    db
      .prepare(`
      SELECT turn, step, request_id, target_json FROM session_turn_targets
      WHERE session_id = ? ORDER BY turn, step
    `)
      .all(sessionId)
      .flatMap((row) => {
        const target = parseTarget(row.target_json);
        return target === undefined ||
          typeof row.turn !== 'number' ||
          typeof row.step !== 'number' ||
          typeof row.request_id !== 'string'
          ? []
          : [{ turn: row.turn, step: row.step, request: row.request_id, target }];
      }),
  );
}

export function lastTurnTarget(
  database: Pick<OperationalDatabaseModulePort, 'read'>,
  sessionId: string,
): TurnTarget | undefined {
  return database.read((db) =>
    parseTarget(
      db
        .prepare(`
        SELECT target_json FROM session_turn_targets WHERE session_id = ?
        ORDER BY turn DESC, step DESC LIMIT 1
      `)
        .get(sessionId)?.target_json,
    ),
  );
}

export function recordTurnTarget(
  database: Pick<OperationalDatabaseModulePort, 'transaction'>,
  sessionId: string,
  segment: TurnTargetSegment,
): void {
  database.transaction(
    (db) => {
      db.prepare(`
      INSERT INTO session_turn_targets (session_id, turn, step, request_id, target_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (session_id, turn, step) DO UPDATE SET
        request_id = excluded.request_id, target_json = excluded.target_json
    `).run(sessionId, segment.turn, segment.step, segment.request, JSON.stringify(segment.target));
    },
    [TURN_TARGET_TOPIC + sessionId],
  );
}
