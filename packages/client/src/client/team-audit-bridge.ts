import type { BridgeCall } from './bridge.js';
import { list, record, unwrap } from './team-bridge.js';

export const PRIVATE_VIEW = 'privateContent.view';
export const AUDIT_VIEW = 'audit.view';
export const AUDIT_PAGE_SIZE = 50;
export const PRIVATE_PAGE_SIZE = 50;

export type PrivateKind = 'bot' | 'channel' | 'dm' | 'bot-dm';
const KINDS: readonly PrivateKind[] = ['bot', 'channel', 'dm', 'bot-dm'];

export interface PrivateObject {
  readonly objectId: string;
  readonly kind: PrivateKind;
  readonly name: string;
  readonly ownerNames: readonly string[];
}

export interface PrivateMessage {
  readonly id: string;
  readonly at: string;
  readonly author: string;
  readonly body: string;
}

export interface PrivateView {
  readonly viewId: string;
  readonly messages: readonly PrivateMessage[];
}

export interface AuditRecord {
  readonly auditId: string;
  readonly at: string;
  readonly viewerName: string;
  readonly kind: PrivateKind;
  readonly objectName: string;
  readonly reason?: string;
  readonly action?: string;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export function parsePrivateObject(value: unknown): PrivateObject | undefined {
  const row = record(value);
  const objectId = text(row?.['objectId']);
  const kind = row?.['kind'];
  const name = text(row?.['name']);
  return objectId !== undefined && KINDS.includes(kind as PrivateKind)
    ? {
        objectId,
        kind: kind as PrivateKind,
        name: name ?? objectId,
        ownerNames: list(row?.['ownerNames'], text),
      }
    : undefined;
}

function authorName(value: unknown): string {
  const author = record(value);
  return (
    text(author?.['displayName']) ??
    text(author?.['name']) ??
    text(author?.['slug']) ??
    text(author?.['humanId']) ??
    ''
  );
}

export function parsePrivateMessage(value: unknown): PrivateMessage | undefined {
  const row = record(value);
  const id = text(row?.['id']);
  if (row === undefined || id === undefined) return undefined;
  return {
    id,
    at: text(row['at']) ?? '',
    author: authorName(row['author']),
    body: typeof row['body'] === 'string' ? row['body'] : '',
  };
}

export function parseAuditRecord(value: unknown): AuditRecord | undefined {
  const row = record(value);
  const auditId = text(row?.['auditId']);
  const kind = row?.['kind'];
  if (row === undefined || auditId === undefined || !KINDS.includes(kind as PrivateKind))
    return undefined;
  const reason = text(row['reason']);
  const action = text(row['action']);
  return {
    auditId,
    at: text(row['at']) ?? '',
    viewerName: text(row['viewerName']) ?? text(row['viewerHumanId']) ?? '',
    kind: kind as PrivateKind,
    objectName: text(row['objectName']) ?? text(row['objectId']) ?? '',
    ...(reason === undefined ? {} : { reason }),
    ...(action === undefined ? {} : { action }),
  };
}

export type AuditActionKey =
  | 'paused'
  | 'resumed'
  | 'deleted'
  | 'transferred'
  | 'purged'
  | 'changed';

export function auditActionKey(action: string): AuditActionKey {
  if (action === 'pause') return 'paused';
  if (action === 'resume') return 'resumed';
  if (action === 'deletionConfirm' || action === 'deletionRetry') return 'deleted';
  if (action === 'transfer') return 'transferred';
  if (action === 'memberPurgeConfirm') return 'purged';
  return 'changed';
}

export async function loadPrivateObjects(
  call: BridgeCall,
  humanId: string | undefined,
  signal?: AbortSignal,
): Promise<PrivateObject[]> {
  return list(
    await unwrap(call, 'privateObjects', humanId === undefined ? {} : { humanId }, signal),
    parsePrivateObject,
  );
}

export async function loadPrivatePage(
  call: BridgeCall,
  viewId: string,
  before: string,
): Promise<PrivateMessage[]> {
  const value = record(await unwrap(call, 'privateContentPage', { viewId, before }));
  return list(value?.['messages'], parsePrivateMessage);
}

export async function openPrivateContent(
  call: BridgeCall,
  object: PrivateObject,
  reason: string,
): Promise<PrivateView> {
  const value = record(
    await unwrap(call, 'privateContentOpen', {
      kind: object.kind,
      objectId: object.objectId,
      ...(reason.trim().length === 0 ? {} : { reason: reason.trim() }),
    }),
  );
  const viewId = text(value?.['viewId']);
  if (viewId === undefined) throw new Error('invalid privateContentOpen response');
  return { viewId, messages: list(value?.['messages'], parsePrivateMessage) };
}

export interface AuditPage {
  readonly records: readonly AuditRecord[];
  readonly next?: string;
}

export async function loadAuditLog(
  call: BridgeCall,
  after: string | undefined,
  signal?: AbortSignal,
): Promise<AuditPage> {
  const value = await unwrap(
    call,
    'auditLog',
    { limit: AUDIT_PAGE_SIZE, ...(after === undefined ? {} : { after }) },
    signal,
  );
  const page = record(value);
  const next = text(page?.['next']);
  return {
    records: list(page?.['records'] ?? page?.['items'] ?? value, parseAuditRecord),
    ...(next === undefined ? {} : { next }),
  };
}

export async function verifyAudit(call: BridgeCall): Promise<boolean> {
  return record(await unwrap(call, 'auditVerify', {}))?.['ok'] === true;
}
