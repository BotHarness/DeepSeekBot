import type { BridgeCall } from './bridge.js';
import { record, unwrap } from './team-bridge.js';

export interface TransferPreview {
  readonly channels: readonly { channelId: string; name: string }[];
  readonly bots: readonly { slug: string; displayName: string }[];
}

export interface PurgePreview {
  readonly token: string;
  readonly counts: { channels: number; bots: number; messages: number; files: number };
}

function rows<T>(value: unknown, keys: readonly (keyof T & string)[]): T[] {
  return Array.isArray(value)
    ? value.flatMap((item: unknown) => {
        const row = record(item);
        if (row === undefined || keys.some((key) => typeof row[key] !== 'string')) return [];
        return [Object.fromEntries(keys.map((key) => [key, row[key]])) as T];
      })
    : [];
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function resetMemberPassword(call: BridgeCall, humanId: string): Promise<string> {
  const value = record(await unwrap(call, 'memberPasswordReset', { humanId }));
  const password = value?.['initialPassword'];
  if (typeof password !== 'string' || password.length === 0)
    throw new Error('invalid memberPasswordReset response');
  return password;
}

export async function deactivateMember(call: BridgeCall, humanId: string): Promise<void> {
  await unwrap(call, 'memberDeactivate', { humanId });
}

export async function reactivateMember(call: BridgeCall, humanId: string): Promise<void> {
  await unwrap(call, 'memberReactivate', { humanId });
}

export async function loadTransferPreview(
  call: BridgeCall,
  humanId: string,
  signal?: AbortSignal,
): Promise<TransferPreview> {
  const value = record(await unwrap(call, 'memberTransferPreview', { humanId }, signal));
  return {
    channels: rows<{ channelId: string; name: string }>(value?.['channels'], ['channelId', 'name']),
    bots: rows<{ slug: string; displayName: string }>(value?.['bots'], ['slug', 'displayName']),
  };
}

export async function transferMember(
  call: BridgeCall,
  humanId: string,
  toHumanId: string,
): Promise<void> {
  await unwrap(call, 'memberTransfer', { humanId, toHumanId });
}

export async function loadPurgePreview(call: BridgeCall, humanId: string): Promise<PurgePreview> {
  const value = record(await unwrap(call, 'memberPurgePreview', { humanId }));
  const counts = record(value?.['counts']);
  const token = value?.['token'];
  if (typeof token !== 'string' || token.length === 0)
    throw new Error('invalid memberPurgePreview response');
  return {
    token,
    counts: {
      channels: count(counts?.['channels']),
      bots: count(counts?.['bots']),
      messages: count(counts?.['messages']),
      files: count(counts?.['files']),
    },
  };
}

export async function confirmPurge(
  call: BridgeCall,
  input: { humanId: string; token: string; username: string },
): Promise<void> {
  await unwrap(call, 'memberPurgeConfirm', input);
}
