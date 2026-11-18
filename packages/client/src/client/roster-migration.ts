import {
  assignRosterChannel,
  createRosterSection,
  loadRoster,
  removeRosterSection,
  reorderRosterSections,
  setRosterPins,
  type BridgeCall,
} from './bridge.js';
import {
  backupLegacyRoster,
  hasRosterMigrated,
  loadLegacyRosterArrangement,
  loadRosterConfig,
  markRosterMigrated,
  saveRosterConfig,
  type ConfigStorage,
} from './roster-config.js';
import { reportFailure } from './diagnostic-log.js';

export interface RosterMigrationOptions {
  storage: ConfigStorage | undefined;
  call: BridgeCall;
  remapSortModes: (mapping: ReadonlyMap<string, string>) => Promise<boolean>;
  warn?: ((message: string, error?: unknown) => void) | undefined;
}

export type RosterMigrationOutcome = 'skipped' | 'migrated' | 'deferred';

export async function migrateLegacyRoster(
  options: RosterMigrationOptions,
): Promise<RosterMigrationOutcome> {
  const { storage, call } = options;
  const warn =
    options.warn ??
    ((message: string, error?: unknown) =>
      reportFailure('roster-migration', message.replace(/^botharness: /u, ''), error));
  if (hasRosterMigrated(storage)) return 'skipped';
  const legacy = loadLegacyRosterArrangement(storage);
  if (legacy === undefined) return 'skipped';
  let host;
  try {
    host = await loadRoster(call);
  } catch (error) {
    warn('botharness: roster migration deferred: rosterGet failed', error);
    return 'deferred';
  }
  if (host.sections.length > 0 || host.pins.length > 0) return 'skipped';

  const mapping = new Map<string, string>();
  const created: string[] = [];
  let pinsAttempted = false;
  const rollback = async (): Promise<void> => {
    for (const sectionId of [...created].reverse()) {
      try {
        await removeRosterSection(call, sectionId);
      } catch (error) {
        warn(`botharness: roster migration rollback could not remove section ${sectionId}`, error);
      }
    }
    if (pinsAttempted) {
      try {
        await setRosterPins(call, []);
      } catch (error) {
        warn('botharness: roster migration rollback could not clear pins', error);
      }
    }
  };

  try {
    for (const section of legacy.sections) {
      const createdSection = await createRosterSection(call, section.name);
      created.push(createdSection.id);
      mapping.set(section.id, createdSection.id);
      for (const channelId of section.channels) {
        await assignRosterChannel(call, channelId, createdSection.id);
      }
    }
    if (mapping.size > 0) {
      await reorderRosterSections(
        call,
        legacy.sections.flatMap((section) => {
          const id = mapping.get(section.id);
          return id === undefined ? [] : [id];
        }),
      );
    }
    if (legacy.pins.length > 0) {
      pinsAttempted = true;
      await setRosterPins(call, legacy.pins);
    }
  } catch (error) {
    warn('botharness: roster migration deferred: host write failed; rolling back', error);
    await rollback();
    return 'deferred';
  }

  if (!(await options.remapSortModes(mapping))) {
    warn('botharness: roster migration deferred: sort modes could not be persisted; rolling back');
    await rollback();
    return 'deferred';
  }

  const collapsed = { ...loadRosterConfig(storage).collapsed };
  for (const section of legacy.sections) {
    const hostId = mapping.get(section.id);
    if (hostId === undefined) continue;
    delete collapsed[section.id];
    if (section.collapsed === true) collapsed[hostId] = true;
  }
  if (!backupLegacyRoster(storage)) {
    warn(
      'botharness: roster migration deferred: the legacy record could not be backed up; rolling back',
    );
    await rollback();
    return 'deferred';
  }
  if (!saveRosterConfig({ collapsed }, storage)) {
    warn(
      'botharness: roster migration deferred: the legacy record could not be cleared; rolling back',
    );
    await rollback();
    return 'deferred';
  }
  markRosterMigrated(storage);
  return 'migrated';
}
