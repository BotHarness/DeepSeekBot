import type { WireRosterSnapshot } from '@botharness/host-protocol/wire';
import { answer, optional, record, strings, text, type HostCall } from './host-answer';

function isRoster(value: unknown): value is WireRosterSnapshot {
  const row = record(value);
  return (
    row !== undefined &&
    strings(row['pins']) &&
    strings(row['hidden']) &&
    strings(row['sectionOrder']) &&
    optional(row['muted'], strings) &&
    Array.isArray(row['sections']) &&
    row['sections'].every((entry: unknown) => {
      const section = record(entry);
      return (
        text(section?.['id']) &&
        section['id'].length > 0 &&
        text(section['name']) &&
        strings(section['channelIds'])
      );
    }) &&
    optional(
      row['topOrder'],
      (rows) =>
        Array.isArray(rows) &&
        rows.every((entry: unknown) => {
          const item = record(entry);
          return (
            (item?.['kind'] === 'section' || item?.['kind'] === 'channel') &&
            text(item['id']) &&
            item['id'].length > 0
          );
        }),
    )
  );
}

export async function readRoster(host: HostCall): Promise<WireRosterSnapshot> {
  return answer(await host.call('rosterGet', {}), isRoster, 'rosterGet');
}

export async function applyRosterBatch(
  host: HostCall,
  args: Record<string, unknown>,
): Promise<WireRosterSnapshot> {
  return answer(await host.call('rosterBatch', args), isRoster, 'rosterBatch');
}
