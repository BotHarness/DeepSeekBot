import type { TunnelApi, TunnelRecord } from './cloudflare.js';
import type { D1Database } from './d1.js';
import { ONLINE } from './pool.js';
import type { HostRow } from './relay-host.js';
import type { RelayOptions } from './relay.js';

export interface ReconcileReport {
  reclaimed: string[];
  vanished: string[];
  repaired: string[];
  staleRecords: number;
  orphanRecords: number;
  orphanTunnels: number;
  deletedAccountHosts: string[];
  failures: number;
  budgetExhausted: boolean;
}

const HOST_LABEL = /^(h[a-z2-7]{12})\.(.+)$/u;

interface RelayReclaimerOptions {
  db: D1Database;
  tunnels: TunnelApi;
  zones: readonly string[];
  options: Pick<RelayOptions, 'reclaimAfterMs'>;
  now(): Date;
  time(value: string | null | undefined): number;
  ownsLabel(label: string): boolean;
  budgetPerRun: number;
  TUNNEL_PREFIX: string;
  zoneOf(row: Pick<HostRow, 'zone'>): string;
  hostname(row: Pick<HostRow, 'id' | 'zone' | 'label'>): string;
  log(event: string, fields: Record<string, unknown>): void;
  clearTunnel(id: string, tunnelId: string | null): Promise<unknown>;
  poolChanged(): void;
}

export function createRelayReclaimer({
  db,
  tunnels,
  zones,
  options,
  now,
  time,
  ownsLabel,
  budgetPerRun,
  TUNNEL_PREFIX,
  zoneOf,
  hostname,
  log,
  clearTunnel,
  poolChanged,
}: RelayReclaimerOptions) {
  return async function reclaim(): Promise<ReconcileReport> {
    await db
      .prepare('DELETE FROM live_activities WHERE expires_at <= ?')
      .bind(now().getTime())
      .run();
    const report: ReconcileReport = {
      reclaimed: [],
      vanished: [],
      repaired: [],
      staleRecords: 0,
      orphanRecords: 0,
      orphanTunnels: 0,
      deletedAccountHosts: [],
      failures: 0,
      budgetExhausted: false,
    };
    const { results: rows } = await db
      .prepare(
        `SELECT hosts.*, EXISTS (SELECT 1 FROM deleted_accounts WHERE deleted_accounts.account = hosts.account) AS account_deleted
          FROM hosts WHERE tunnel_id IS NOT NULL OR dns_record_id IS NOT NULL
          ORDER BY cleanup_at IS NOT NULL, cleanup_at, tunnel_created_at, id`,
      )
      .all<HostRow & { account_deleted: number }>();
    const listed = await tunnels.listTunnels();
    const recordsByZone = new Map<string, TunnelRecord[]>();
    for (const zone of zones) {
      try {
        recordsByZone.set(zone, await tunnels.listRecords(zone));
      } catch {
        report.failures += 1;
      }
    }
    const at = now().getTime();
    const window = options.reclaimAfterMs;
    const old = (stamp: string | null | undefined) => {
      const parsed = time(stamp);
      return !Number.isFinite(parsed) || at - parsed >= window;
    };
    const rowByLabel = new Map(rows.map((row) => [row.label ?? row.id, row]));
    const recordsFor = (row: HostRow) =>
      (recordsByZone.get(zoneOf(row)) ?? []).filter(
        (record) => record.name.toLowerCase() === hostname(row),
      );
    let budget = budgetPerRun;
    const spend = (cost: number) => {
      if (budget < cost) {
        report.budgetExhausted = true;
        return false;
      }
      budget -= cost;
      return true;
    };
    const failed = async (row: HostRow) => {
      report.failures += 1;
      await db
        .prepare('UPDATE hosts SET cleanup_at = ? WHERE id = ?')
        .bind(new Date(at).toISOString(), row.id)
        .run()
        .catch(() => undefined);
    };
    const dropRecords = async (row: HostRow, records: readonly TunnelRecord[]) => {
      for (const record of records) await tunnels.deleteRecord(zoneOf(row), record.id);
    };

    for (const row of rows) {
      if (row.tunnel_id === null) continue;
      const state = listed.states.get(row.tunnel_id);
      if (state === undefined) continue;
      if (
        state.status !== row.tunnel_status ||
        (state.inactiveSince ?? null) !== row.tunnel_inactive_since
      ) {
        await db
          .prepare(
            'UPDATE hosts SET tunnel_status = ?, tunnel_inactive_since = ? WHERE id = ? AND tunnel_id = ?',
          )
          .bind(state.status, state.inactiveSince ?? null, row.id, row.tunnel_id)
          .run();
        row.tunnel_status = state.status;
        row.tunnel_inactive_since = state.inactiveSince ?? null;
      }
    }

    for (const row of rows) {
      if (row.tunnel_id === null || listed.states.has(row.tunnel_id) || !listed.complete) continue;
      if (!old(row.tunnel_created_at)) continue;
      const records = recordsFor(row);
      if (!spend(records.length)) break;
      try {
        await dropRecords(row, records);
        await clearTunnel(row.id, row.tunnel_id);
        report.vanished.push(row.id);
        row.tunnel_id = null;
        row.dns_record_id = null;
      } catch {
        await failed(row);
      }
    }

    for (const row of rows) {
      if (row.tunnel_id === null || row.account_deleted) continue;
      const state = listed.states.get(row.tunnel_id);
      if (state === undefined || !ONLINE.has(state.status)) continue;
      if (!recordsByZone.has(zoneOf(row))) continue;
      const records = recordsFor(row);
      const kept =
        records.find((record) => record.id === row.dns_record_id) ??
        records.find((record) => record.target === row.tunnel_id) ??
        records[0];
      const extras = records.filter((record) => record !== kept);
      if (kept?.target === row.tunnel_id && kept.id === row.dns_record_id && extras.length === 0)
        continue;
      if (!spend(2 + extras.length)) break;
      try {
        const id = await tunnels.pointHostname(zoneOf(row), hostname(row), row.tunnel_id, kept?.id);
        await dropRecords(row, extras);
        await db
          .prepare('UPDATE hosts SET dns_record_id = ? WHERE id = ? AND tunnel_id = ?')
          .bind(id, row.id, row.tunnel_id)
          .run();
        row.dns_record_id = id;
        report.repaired.push(row.id);
        log('connect-dns-repaired', { host: row.id, zone: zoneOf(row) });
      } catch {
        await failed(row);
      }
    }

    for (const row of rows) {
      if (row.tunnel_id === null) continue;
      const state = listed.states.get(row.tunnel_id);
      if (state === undefined) continue;
      const deleted = Boolean(row.account_deleted);
      if (!deleted) {
        if (ONLINE.has(state.status)) continue;
        if (!old(state.inactiveSince ?? row.tunnel_created_at)) continue;
      }
      const records = recordsFor(row);
      const ownRecord =
        row.dns_record_id !== null && !records.some((record) => record.id === row.dns_record_id)
          ? 1
          : 0;
      if (!spend(2 + records.length + ownRecord)) break;
      try {
        await tunnels.deleteTunnel(row.tunnel_id);
        await dropRecords(row, records);
        if (ownRecord) await tunnels.deleteRecord(zoneOf(row), row.dns_record_id as string);
        if (deleted) {
          await db.prepare('DELETE FROM live_activities WHERE host_id = ?').bind(row.id).run();
          await db.prepare('DELETE FROM hosts WHERE id = ?').bind(row.id).run();
          report.deletedAccountHosts.push(row.id);
          rowByLabel.delete(row.label ?? row.id);
        } else {
          await clearTunnel(row.id, row.tunnel_id);
          report.reclaimed.push(row.id);
        }
        row.tunnel_id = null;
        row.dns_record_id = null;
      } catch {
        await failed(row);
      }
    }

    for (const zone of zones) {
      const records = recordsByZone.get(zone);
      if (records === undefined) continue;
      for (const record of records) {
        const match = HOST_LABEL.exec(record.name.toLowerCase());
        if (match === null || match[2] !== zone || !ownsLabel(match[1] as string)) continue;
        const row = rowByLabel.get(match[1] as string);
        const live =
          row !== undefined &&
          zoneOf(row) === zone &&
          row.tunnel_id !== null &&
          (row.dns_record_id === record.id || row.dns_record_id === null) &&
          record.target === row.tunnel_id;
        if (live) continue;
        if (row?.tunnel_id != null && zoneOf(row) === zone) continue;
        if (!old(record.createdAt)) continue;
        if (!spend(1)) break;
        try {
          await tunnels.deleteRecord(zone, record.id);
          if (row !== undefined) {
            await db
              .prepare(
                'UPDATE hosts SET dns_record_id = NULL WHERE id = ? AND tunnel_id IS NULL AND dns_record_id = ?',
              )
              .bind(row.id, record.id)
              .run();
            report.staleRecords += 1;
          } else report.orphanRecords += 1;
        } catch {
          report.failures += 1;
        }
      }
    }

    for (const row of rows) {
      if (row.tunnel_id !== null || row.dns_record_id === null) continue;
      const zoneRecordsListed = recordsByZone.get(zoneOf(row));
      if (zoneRecordsListed === undefined) continue;
      if (zoneRecordsListed.some((record) => record.id === row.dns_record_id)) continue;
      await db
        .prepare(
          'UPDATE hosts SET dns_record_id = NULL WHERE id = ? AND tunnel_id IS NULL AND dns_record_id = ?',
        )
        .bind(row.id, row.dns_record_id)
        .run();
    }

    if (listed.complete) {
      const referenced = new Set(
        rows.flatMap((row) => (row.tunnel_id === null ? [] : [row.tunnel_id])),
      );
      for (const [tunnelId, state] of listed.states) {
        if (referenced.has(tunnelId) || !state.name?.startsWith(TUNNEL_PREFIX)) continue;
        if (!old(state.createdAt)) continue;
        if (!spend(2)) break;
        try {
          await tunnels.deleteTunnel(tunnelId);
          report.orphanTunnels += 1;
        } catch {
          report.failures += 1;
        }
      }
    }

    if (
      report.reclaimed.length +
        report.vanished.length +
        report.repaired.length +
        report.staleRecords +
        report.orphanRecords +
        report.orphanTunnels +
        report.deletedAccountHosts.length +
        report.failures >
        0 ||
      report.budgetExhausted
    )
      log('connect-reconcile', {
        reclaimed: report.reclaimed.length,
        vanished: report.vanished.length,
        repaired: report.repaired.length,
        staleRecords: report.staleRecords,
        orphanRecords: report.orphanRecords,
        orphanTunnels: report.orphanTunnels,
        deletedAccountHosts: report.deletedAccountHosts.length,
        failures: report.failures,
        budgetExhausted: report.budgetExhausted,
        tunnels: listed.states.size,
        listComplete: listed.complete,
      });
    poolChanged();
    return report;
  };
}
