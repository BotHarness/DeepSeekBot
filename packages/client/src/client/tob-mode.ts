import type { ChannelDockStorage } from './channel-dock-layout.js';

export const TOB_MODE_STORAGE_KEY = 'botharness.bot-mode-tob-mode';

export interface TobModeState {
  readonly active: boolean;
  readonly previousChannelId?: string | undefined;
}

export const INACTIVE_TOB_MODE: TobModeState = { active: false };

function browserStorage(): ChannelDockStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readTobMode(
  storage: ChannelDockStorage | undefined = browserStorage(),
): TobModeState {
  try {
    const raw = storage?.getItem(TOB_MODE_STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return INACTIVE_TOB_MODE;
    const record = value as Record<string, unknown>;
    if (record['active'] !== true) return INACTIVE_TOB_MODE;
    const previous = record['previousChannelId'];
    return typeof previous === 'string' && previous.length > 0
      ? { active: true, previousChannelId: previous }
      : { active: true };
  } catch {
    return INACTIVE_TOB_MODE;
  }
}

export function writeTobMode(
  state: TobModeState,
  storage: ChannelDockStorage | undefined = browserStorage(),
): boolean {
  try {
    storage?.setItem(TOB_MODE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export interface TobModeOwner {
  active(): boolean;
  setActive(active: boolean): void;
}

export interface TobModeControl {
  attach(owner: TobModeOwner): () => void;
  available(): boolean;
  toggle(): void;
  onEnter(listener: () => void): () => void;
}

export function createTobModeControl(): TobModeControl {
  let owner: TobModeOwner | undefined;
  const listeners = new Set<() => void>();
  return {
    attach(next) {
      owner = next;
      return () => {
        if (owner === next) owner = undefined;
      };
    },
    available: () => owner !== undefined,
    toggle() {
      if (!owner) return;
      const entering = !owner.active();
      owner.setActive(entering);
      if (entering && owner.active()) for (const listener of [...listeners]) listener();
    },
    onEnter(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
