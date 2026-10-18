import type { ConfigStorage } from './roster-config.js';
import type { ConversationSelection } from './store.js';

export interface LastView {
  mode: 'bot' | 'dsh';
  selection: ConversationSelection | undefined;
}

export const LAST_VIEW_KEY = 'botharness/last-view.v1';
const CONSUMED_KEY = '__botharnessLastViewConsumed';

function parseSelection(value: unknown): ConversationSelection | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const selection = value as Record<string, unknown>;
  if (selection['kind'] === 'bot' && typeof selection['slug'] === 'string') {
    return { kind: 'bot', slug: selection['slug'] };
  }
  if (selection['kind'] === 'channel' && typeof selection['channelId'] === 'string') {
    return { kind: 'channel', channelId: selection['channelId'] };
  }
  if (selection['kind'] === 'inbox') return { kind: 'inbox' };
  return undefined;
}

export function readLastView(storage: ConfigStorage | undefined): LastView | undefined {
  try {
    const raw = storage?.getItem(LAST_VIEW_KEY);
    if (raw === undefined || raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return undefined;
    const record = value as Record<string, unknown>;
    if (record['mode'] !== 'bot' && record['mode'] !== 'dsh') return undefined;
    return { mode: record['mode'], selection: parseSelection(record['selection']) };
  } catch {
    return undefined;
  }
}

export function consumeLastView(
  target: Record<string, unknown>,
  storage: ConfigStorage | undefined,
): LastView | undefined {
  if (target[CONSUMED_KEY] === true) return undefined;
  target[CONSUMED_KEY] = true;
  return readLastView(storage);
}

export function writeLastView(storage: ConfigStorage | undefined, view: LastView): void {
  try {
    storage?.setItem(LAST_VIEW_KEY, JSON.stringify(view));
  } catch {}
}
