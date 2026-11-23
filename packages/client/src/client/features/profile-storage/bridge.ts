import { asRecord, BridgeCallError, unwrap, type BridgeCall } from '../../bridge-transport.js';
import type { DataResetPreview, DataResetResult } from '../../bridge.js';
const DATA_RESET_TARGETS = new Set(['data', 'im-settings', 'local-tools']);
const DATA_RESET_KEPT = new Set(['credentials', 'memory', 'exports']);

function parseDataResetPreview(value: unknown): DataResetPreview {
  const preview = asRecord(asRecord(value)?.['preview']);
  const token = preview?.['token'];
  const bots = preview?.['bots'];
  const targets = preview?.['targets'];
  const kept = preview?.['kept'];
  if (
    typeof token !== 'string' ||
    typeof bots !== 'number' ||
    !Array.isArray(targets) ||
    !Array.isArray(kept)
  )
    throw new BridgeCallError('invalid-response', 'Invalid data reset preview');
  return {
    token,
    bots,
    targets: targets.flatMap((entry) => {
      const target = asRecord(entry);
      const kind = target?.['kind'];
      const path = target?.['path'];
      const bytes = target?.['bytes'];
      const files = target?.['files'];
      if (
        typeof kind !== 'string' ||
        !DATA_RESET_TARGETS.has(kind) ||
        typeof path !== 'string' ||
        typeof bytes !== 'number' ||
        typeof files !== 'number'
      )
        return [];
      return [
        {
          kind: kind as DataResetPreview['targets'][number]['kind'],
          path,
          bytes,
          files,
          ...(target?.['partial'] === true ? { partial: true } : {}),
        },
      ];
    }),
    kept: kept.flatMap((entry) => {
      const item = asRecord(entry);
      const kind = item?.['kind'];
      const path = item?.['path'];
      return typeof kind === 'string' && DATA_RESET_KEPT.has(kind) && typeof path === 'string'
        ? [{ kind: kind as DataResetPreview['kept'][number]['kind'], path }]
        : [];
    }),
    restartable: preview?.['restartable'] === true,
  };
}

export async function loadDataResetPreview(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<DataResetPreview> {
  return parseDataResetPreview(await unwrap(call, 'dataResetPreview', {}, signal));
}

export async function confirmDataReset(call: BridgeCall, token: string): Promise<DataResetResult> {
  const reset = asRecord(asRecord(await unwrap(call, 'dataResetConfirm', { token }))?.['reset']);
  return reset?.['status'] === 'restarting'
    ? { status: 'restarting' }
    : { status: 'restart-required' };
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
