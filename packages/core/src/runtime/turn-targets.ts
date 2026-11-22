import {
  isTurnTarget,
  isTurnTargetSwitchReason,
  type TurnTarget,
  type TurnTargetSwitchReason,
  type TurnModelSwitch,
  type SessionTurnModelSwitch,
} from '@botharness/host-protocol/turn-target';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const TURN_TARGET_TOPIC = 'session-turn-target:';

export interface TurnTargetSegment {
  turn: number;
  step: number;
  request: string;
  target: TurnTarget;
  switchReason?: TurnTargetSwitchReason;
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
      SELECT turn, step, request_id, target_json, switch_reason FROM session_turn_targets
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
          : [
              {
                turn: row.turn,
                step: row.step,
                request: row.request_id,
                target,
                ...(isTurnTargetSwitchReason(row.switch_reason)
                  ? { switchReason: row.switch_reason }
                  : {}),
              },
            ];
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
      INSERT INTO session_turn_targets (session_id, turn, step, request_id, target_json, switch_reason)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (session_id, turn, step) DO UPDATE SET
        request_id = excluded.request_id, target_json = excluded.target_json, switch_reason = excluded.switch_reason
    `).run(
        sessionId,
        segment.turn,
        segment.step,
        segment.request,
        JSON.stringify(segment.target),
        segment.switchReason ?? null,
      );
    },
    [TURN_TARGET_TOPIC + sessionId],
  );
}

export function turnSwitchBetween(
  from: TurnTarget | undefined,
  to: TurnTarget,
  reason?: TurnTargetSwitchReason,
): TurnModelSwitch | undefined {
  if (from?.model === undefined || to.model === undefined) return;
  if (from.kind === to.kind && from.model === to.model) return;
  return { from, to, ...(reason === undefined ? {} : { reason }) };
}

export function readTurnModelSwitch(
  database: Pick<OperationalDatabaseModulePort, 'read'>,
  sessionId: string,
  segment: TurnTargetSegment,
): SessionTurnModelSwitch | undefined {
  const previous = database.read((db) =>
    db
      .prepare(`
      SELECT target_json FROM session_turn_targets
      WHERE session_id = ? AND turn < ? ORDER BY turn DESC, step DESC LIMIT 1
    `)
      .get(sessionId, segment.turn),
  );
  const change = turnSwitchBetween(
    parseTarget(previous?.target_json),
    segment.target,
    segment.switchReason,
  );
  return change === undefined ? undefined : { ...change, sessionId, turn: segment.turn };
}
