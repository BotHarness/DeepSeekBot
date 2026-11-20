import { humanContext, type HumanContext } from '../humans/context.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export function pairedDeviceHuman(
  database: OperationalDatabaseModulePort,
  deviceId: string,
): HumanContext | undefined {
  const row = database.read((db) =>
    db
      .prepare('SELECT human_id FROM paired_devices WHERE device_id = ? AND revoked_at IS NULL')
      .get(deviceId),
  );
  return typeof row?.human_id === 'string' ? humanContext(row.human_id) : undefined;
}

export function deviceOwnsRequest(
  database: OperationalDatabaseModulePort,
  deviceId: string,
  sourceEventId: string,
): boolean {
  return (
    database.read((db) =>
      db
        .prepare(`
    SELECT 1 FROM paired_devices d JOIN source_events e ON e.source_event_id = ?
    WHERE d.device_id = ? AND d.revoked_at IS NULL
      AND d.human_id = coalesce(e.human_id, 'local-human')
  `)
        .get(sourceEventId, deviceId),
    ) !== undefined
  );
}
