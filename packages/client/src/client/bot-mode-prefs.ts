import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store';

import {
  BOT_MODE_ICON_FIELD,
  BOT_MODE_ASSIGNMENT_LIMIT_FIELD,
  DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
  isAssignmentConcurrencyLimit,
  BOT_MODE_DEVELOPER_FIELD,
  BOT_MODE_GROUP_AUTO_ACCEPT_FIELD,
  DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT,
  BOT_MODE_MOTION_FIELD,
  BOT_MODE_SEND_KEY_FIELD,
  BOT_MODE_SORT_FIELD,
  BOT_MODE_SORT_MODES_FIELD,
  BOT_MODE_SHOW_APPROVAL_REVIEW_SESSIONS_FIELD,
  BOT_MODE_SHOW_BOT_SESSIONS_FIELD,
  DEFAULT_BOT_MODE_ICON,
  DEFAULT_BOT_MODE_DEVELOPER,
  DEFAULT_BOT_MODE_MOTION,
  DEFAULT_BOT_MODE_SEND_KEY,
  DEFAULT_BOT_MODE_SORT,
  DEFAULT_BOT_MODE_SHOW_APPROVAL_REVIEW_SESSIONS,
  DEFAULT_BOT_MODE_SHOW_BOT_SESSIONS,
  isBotModeIcon,
  isBotModeMotionPreference,
  isBotModeSendKey,
  type BotModeIcon,
  type BotModeSettings,
  type BotModeMotionPreference,
  type BotModeSendKey,
  type BotModeSortMode,
} from '../bot-mode-settings.js';
import {
  resolveEffectiveMotion,
  type EffectiveMotion,
  type SystemMotionSource,
} from './motion-preference.js';
import {
  clearLegacySortPreference,
  readLegacySortPreference,
  type ConfigStorage,
  type LegacySortPreference,
} from './roster-config.js';

export type BotModePathOp =
  | { op: 'set'; path: string[]; value: string }
  | { op: 'unset'; path: string[] };

export interface BotModeScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable';
  value: BotModeSettings | undefined;
  user: unknown;
  writable: boolean;
  mode: 'host' | 'memory';
}

export interface BotModeScope {
  getSnapshot(): BotModeScopeSnapshot;
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<boolean | void>;
  mutate(ops: readonly BotModePathOp[], expectedRevision?: number): Promise<boolean | void>;
}

export interface BotModePrefsSnapshot {
  assignmentConcurrencyLimit: number;
  autoAcceptGroupInvites: boolean;
  developerMode: boolean;
  showBotSessions: boolean;
  showApprovalReviewSessions: boolean;
  motionPreference: BotModeMotionPreference;
  botIcon: BotModeIcon;
  sendKey: BotModeSendKey;
  effectiveMotion: EffectiveMotion;
  sortMode: BotModeSortMode;
  sortModes: Record<string, BotModeSortMode>;
  mode: 'host' | 'memory';
  status: 'loading' | 'ready' | 'unavailable';
}

export type SectionSortMode = 'inherit' | BotModeSortMode;

export function sectionSortMode(
  snapshot: BotModePrefsSnapshot,
  sectionId: string,
): SectionSortMode {
  return snapshot.sortModes[sectionId] ?? 'inherit';
}

export interface BotModePrefsFace {
  setAssignmentConcurrencyLimit: (limit: number) => Promise<boolean>;
  hooks: {
    botModePrefs: SnapshotStore<BotModePrefsSnapshot>;
  };
  setMotionPreference: (preference: BotModeMotionPreference) => void;
  setBotIcon: (icon: BotModeIcon) => void;
  setSendKey: (sendKey: BotModeSendKey) => void;
  setDeveloperMode: (enabled: boolean) => void;
  setShowBotSessions: (enabled: boolean) => void;
  setShowApprovalReviewSessions: (enabled: boolean) => void;
  setAutoAcceptGroupInvites: (enabled: boolean) => void;
  setSortMode: (mode: BotModeSortMode) => void;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
}

export function botModePrefsFace(prefs: BotModePrefs): BotModePrefsFace {
  return {
    setAssignmentConcurrencyLimit: (limit) => prefs.setAssignmentConcurrencyLimit(limit),
    hooks: { botModePrefs: prefs.source },
    setAutoAcceptGroupInvites: (enabled) => prefs.setAutoAcceptGroupInvites(enabled),
    setMotionPreference: (preference) => {
      prefs.setMotionPreference(preference);
    },
    setBotIcon: (icon) => {
      prefs.setBotIcon(icon);
    },
    setSendKey: (sendKey) => {
      prefs.setSendKey(sendKey);
    },
    setDeveloperMode: (enabled) => {
      prefs.setDeveloperMode(enabled);
    },
    setShowBotSessions: (enabled) => {
      prefs.setShowBotSessions(enabled);
    },
    setShowApprovalReviewSessions: (enabled) => {
      prefs.setShowApprovalReviewSessions(enabled);
    },
    setSortMode: (mode) => {
      prefs.setSortMode(mode);
    },
    setSectionSortMode: (sectionId, mode) => {
      prefs.setSectionSortMode(sectionId, mode);
    },
  };
}

function userField(user: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof user !== 'object' || user === null || Array.isArray(user)) return undefined;
  const field = (user as Record<string, unknown>)[key];
  if (typeof field !== 'object' || field === null || Array.isArray(field)) return undefined;
  return field as Record<string, unknown>;
}

function hasOwn(value: unknown, key: string): boolean {
  return typeof value === 'object' && value !== null && key in value;
}

function legacyMigrationOps(legacy: LegacySortPreference, user: unknown): BotModePathOp[] {
  const ops: BotModePathOp[] = [];
  if (legacy.global !== undefined && !hasOwn(user, BOT_MODE_SORT_FIELD)) {
    ops.push({ op: 'set', path: [BOT_MODE_SORT_FIELD], value: legacy.global });
  }
  const userModes = userField(user, BOT_MODE_SORT_MODES_FIELD) ?? {};
  for (const [id, mode] of Object.entries(legacy.sections)) {
    if (!(id in userModes)) {
      ops.push({ op: 'set', path: [BOT_MODE_SORT_MODES_FIELD, id], value: mode });
    }
  }
  return ops;
}

function legacyApplied(legacy: LegacySortPreference, user: unknown): boolean {
  if (legacy.global !== undefined && !hasOwn(user, BOT_MODE_SORT_FIELD)) return false;
  const userModes = userField(user, BOT_MODE_SORT_MODES_FIELD) ?? {};
  return Object.keys(legacy.sections).every((id) => id in userModes);
}

export class BotModePrefs {
  readonly source: SnapshotStore<BotModePrefsSnapshot>;

  private readonly storage: ConfigStorage | undefined;
  private host: BotModeScope | undefined;
  private detachHost: (() => void) | undefined;
  private detachSystemMotion: (() => void) | undefined;
  private systemReduced = false;
  private migration: 'pending' | 'attempted' | 'done' = 'pending';

  constructor(storage?: ConfigStorage | undefined) {
    this.storage = storage;
    this.source = createSnapshotStore<BotModePrefsSnapshot>({
      assignmentConcurrencyLimit: DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
      autoAcceptGroupInvites: DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT,
      motionPreference: DEFAULT_BOT_MODE_MOTION,
      botIcon: DEFAULT_BOT_MODE_ICON,
      sendKey: DEFAULT_BOT_MODE_SEND_KEY,
      developerMode: DEFAULT_BOT_MODE_DEVELOPER,
      showBotSessions: DEFAULT_BOT_MODE_SHOW_BOT_SESSIONS,
      showApprovalReviewSessions: DEFAULT_BOT_MODE_SHOW_APPROVAL_REVIEW_SESSIONS,
      effectiveMotion: resolveEffectiveMotion(DEFAULT_BOT_MODE_MOTION, this.systemReduced),
      sortMode: DEFAULT_BOT_MODE_SORT,
      sortModes: {},
      mode: 'memory',
      status: 'loading',
    });
  }

  attachSystemMotion(source: SystemMotionSource | undefined): () => void {
    this.detachSystemMotion?.();
    this.detachSystemMotion = undefined;
    this.publishSystemMotion(source?.reduced ?? false);
    if (source === undefined) return () => {};
    const unsubscribe = source.subscribe((reduced) => {
      this.publishSystemMotion(reduced);
    });
    let active = true;
    const detach = (): void => {
      if (!active) return;
      active = false;
      unsubscribe();
      if (this.detachSystemMotion === detach) this.detachSystemMotion = undefined;
    };
    this.detachSystemMotion = detach;
    return detach;
  }

  attach(host: BotModeScope): void {
    if (this.host === host) return;
    this.detach();
    this.host = host;
    this.migration = 'pending';
    this.detachHost = host.subscribe(() => {
      this.sync();
    });
    this.sync();
  }

  detach(): void {
    this.detachHost?.();
    this.detachHost = undefined;
    this.host = undefined;
  }

  dispose(): void {
    this.detach();
    this.detachSystemMotion?.();
    this.detachSystemMotion = undefined;
  }

  setMotionPreference(preference: BotModeMotionPreference): void {
    if (this.source.getSnapshot().motionPreference === preference) return;
    this.source.update((draft) => {
      draft.motionPreference = preference;
      draft.effectiveMotion = resolveEffectiveMotion(preference, this.systemReduced);
    });
    if (this.host !== undefined) {
      this.persist(this.host.set(BOT_MODE_MOTION_FIELD, preference));
    }
  }

  setBotIcon(icon: BotModeIcon): void {
    if (this.source.getSnapshot().botIcon === icon) return;
    this.source.update((draft) => {
      draft.botIcon = icon;
    });
    if (this.host !== undefined) this.persist(this.host.set(BOT_MODE_ICON_FIELD, icon));
  }

  setSendKey(sendKey: BotModeSendKey): void {
    if (this.source.getSnapshot().sendKey === sendKey) return;
    this.source.update((draft) => {
      draft.sendKey = sendKey;
    });
    if (this.host !== undefined) this.persist(this.host.set(BOT_MODE_SEND_KEY_FIELD, sendKey));
  }

  async setAssignmentConcurrencyLimit(limit: number): Promise<boolean> {
    if (!isAssignmentConcurrencyLimit(limit)) return false;
    const host = this.host;
    const scope = host?.getSnapshot();
    if (host === undefined || scope?.status !== 'ready' || scope.mode !== 'host' || !scope.writable)
      return false;
    const accepted = await host.set(BOT_MODE_ASSIGNMENT_LIMIT_FIELD, limit);
    this.sync();
    return accepted !== false;
  }

  setAutoAcceptGroupInvites(enabled: boolean): void {
    const host = this.host;
    const scope = host?.getSnapshot();
    if (host === undefined || scope?.status !== 'ready' || !scope.writable) return;
    if (this.source.getSnapshot().autoAcceptGroupInvites === enabled) return;
    this.source.update((draft) => {
      draft.autoAcceptGroupInvites = enabled;
    });
    void host
      .set(BOT_MODE_GROUP_AUTO_ACCEPT_FIELD, enabled)
      .then((accepted) => {
        if (accepted === false) this.sync();
      })
      .catch((error: unknown) => {
        this.sync();
        console.warn('botharness: failed to persist Group invitation policy', error);
      });
  }

  setDeveloperMode(enabled: boolean): void {
    if (this.source.getSnapshot().developerMode === enabled) return;
    this.source.update((draft) => {
      draft.developerMode = enabled;
    });
    if (this.host !== undefined) this.persist(this.host.set(BOT_MODE_DEVELOPER_FIELD, enabled));
  }

  setShowBotSessions(enabled: boolean): void {
    if (this.source.getSnapshot().showBotSessions === enabled) return;
    this.source.update((draft) => {
      draft.showBotSessions = enabled;
    });
    if (this.host !== undefined)
      this.persist(this.host.set(BOT_MODE_SHOW_BOT_SESSIONS_FIELD, enabled));
  }

  setShowApprovalReviewSessions(enabled: boolean): void {
    if (this.source.getSnapshot().showApprovalReviewSessions === enabled) return;
    this.source.update((draft) => {
      draft.showApprovalReviewSessions = enabled;
    });
    if (this.host !== undefined)
      this.persist(this.host.set(BOT_MODE_SHOW_APPROVAL_REVIEW_SESSIONS_FIELD, enabled));
  }

  setSortMode(mode: BotModeSortMode): void {
    if (this.source.getSnapshot().sortMode === mode) return;
    this.source.update((draft) => {
      draft.sortMode = mode;
    });
    if (this.host !== undefined) this.persist(this.host.set(BOT_MODE_SORT_FIELD, mode));
  }

  setSectionSortMode(sectionId: string, mode: BotModeSortMode | undefined): void {
    if (this.source.getSnapshot().sortModes[sectionId] === mode) return;
    this.source.update((draft) => {
      if (mode === undefined) delete draft.sortModes[sectionId];
      else draft.sortModes[sectionId] = mode;
    });
    if (this.host === undefined) return;
    const op: BotModePathOp =
      mode === undefined
        ? { op: 'unset', path: [BOT_MODE_SORT_MODES_FIELD, sectionId] }
        : { op: 'set', path: [BOT_MODE_SORT_MODES_FIELD, sectionId], value: mode };
    this.persist(this.host.mutate([op]));
  }

  async remapSectionSortModes(mapping: ReadonlyMap<string, string>): Promise<boolean> {
    const host = this.host;
    const snapshot = this.source.getSnapshot();
    const legacy = readLegacySortPreference(this.storage)?.sections ?? {};
    const modes = new Map<string, BotModeSortMode>(Object.entries(legacy));
    for (const [id, mode] of Object.entries(snapshot.sortModes)) modes.set(id, mode);
    const ops: BotModePathOp[] = [];
    const next = { ...snapshot.sortModes };
    let pending = false;
    for (const [legacyId, hostId] of mapping) {
      const mode = modes.get(legacyId);
      if (mode === undefined) continue;
      if (host === undefined) {
        pending = true;
        continue;
      }
      delete next[legacyId];
      next[hostId] = mode;
      ops.push({ op: 'unset', path: [BOT_MODE_SORT_MODES_FIELD, legacyId] });
      ops.push({ op: 'set', path: [BOT_MODE_SORT_MODES_FIELD, hostId], value: mode });
    }
    if (pending || host === undefined) return false;
    if (ops.length === 0) return true;
    this.source.update((draft) => {
      draft.sortModes = next;
    });
    try {
      await host.mutate(ops);
      return true;
    } catch (error) {
      this.source.update((draft) => {
        draft.sortModes = snapshot.sortModes;
      });
      console.warn('botharness: failed to remap the BOT-mode sort modes', error);
      return false;
    }
  }

  private sync(): void {
    const host = this.host;
    if (host === undefined) return;
    const scope = host.getSnapshot();
    const section = scope.value;
    this.source.update((draft) => {
      draft.status = scope.status;
      draft.mode = scope.mode;
      if (section !== undefined) {
        const motionPreference = isBotModeMotionPreference(section.motionPreference)
          ? section.motionPreference
          : DEFAULT_BOT_MODE_MOTION;
        draft.motionPreference = motionPreference;
        draft.effectiveMotion = resolveEffectiveMotion(motionPreference, this.systemReduced);
        draft.sortMode = section.sortMode;
        draft.sortModes = { ...section.sortModes };
        draft.botIcon = isBotModeIcon(section.botIcon) ? section.botIcon : DEFAULT_BOT_MODE_ICON;
        draft.sendKey = isBotModeSendKey(section.sendKey)
          ? section.sendKey
          : DEFAULT_BOT_MODE_SEND_KEY;
        draft.assignmentConcurrencyLimit = isAssignmentConcurrencyLimit(
          section.assignmentConcurrencyLimit,
        )
          ? section.assignmentConcurrencyLimit
          : DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT;
        draft.developerMode = section.developerMode === true;
        draft.showBotSessions = section.showBotSessions !== false;
        draft.showApprovalReviewSessions = section.showApprovalReviewSessions === true;
        draft.autoAcceptGroupInvites = section.autoAcceptGroupInvites !== false;
      }
    });
    this.migrate(scope);
  }

  private publishSystemMotion(reduced: boolean): void {
    this.systemReduced = reduced;
    this.source.update((draft) => {
      draft.effectiveMotion = resolveEffectiveMotion(draft.motionPreference, reduced);
    });
  }

  private migrate(scope: BotModeScopeSnapshot): void {
    if (this.migration === 'done' || scope.status !== 'ready' || !scope.writable) return;
    const legacy = readLegacySortPreference(this.storage);
    if (legacy === undefined) {
      this.migration = 'done';
      return;
    }
    if (this.migration === 'attempted') {
      if (legacyApplied(legacy, scope.user)) {
        clearLegacySortPreference(this.storage);
        this.migration = 'done';
      }
      return;
    }
    const ops = legacyMigrationOps(legacy, scope.user);
    if (ops.length === 0) {
      clearLegacySortPreference(this.storage);
      this.migration = 'done';
      return;
    }
    this.migration = 'attempted';
    if (this.host !== undefined) this.persist(this.host.mutate(ops));
  }

  private persist(operation: Promise<boolean | void>): void {
    operation.catch((error: unknown) => {
      console.warn('botharness: failed to persist the BOT-mode preference', error);
    });
  }
}
