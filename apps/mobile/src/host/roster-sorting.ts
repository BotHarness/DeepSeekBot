import {
  BOT_MODE_NAMESPACE,
  DEFAULT_BOT_MODE_SORT,
  isBotModeSortMode,
  type BotModeSortMode,
} from '../../../../packages/client/src/bot-mode-settings';

export interface RosterSorting {
  sortMode: BotModeSortMode;
  sortModes: Readonly<Record<string, BotModeSortMode>>;
}

export const DEFAULT_ROSTER_SORTING: RosterSorting = {
  sortMode: DEFAULT_BOT_MODE_SORT,
  sortModes: {},
};

/** Read only the Web-owned sorting fields from the native redacted settings response. */
export function rosterSortingOf(value: unknown): RosterSorting {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('namespaces' in value) ||
    !Array.isArray(value.namespaces)
  )
    throw new Error('Invalid Host settings response');
  const namespace: unknown = value.namespaces.find(
    (entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      'ns' in entry &&
      entry.ns === BOT_MODE_NAMESPACE,
  );
  if (namespace === undefined) return DEFAULT_ROSTER_SORTING;
  if (
    typeof namespace !== 'object' ||
    namespace === null ||
    !('value' in namespace) ||
    typeof namespace.value !== 'object' ||
    namespace.value === null
  )
    throw new Error('Invalid Host sorting settings');
  const settings = namespace.value;
  const mode = 'sortMode' in settings ? settings.sortMode : DEFAULT_BOT_MODE_SORT;
  const modes = 'sortModes' in settings ? settings.sortModes : {};
  if (
    !isBotModeSortMode(mode) ||
    typeof modes !== 'object' ||
    modes === null ||
    Array.isArray(modes)
  )
    throw new Error('Invalid Host sorting settings');
  const sortModes: Record<string, BotModeSortMode> = {};
  for (const [id, override] of Object.entries(modes)) {
    if (!isBotModeSortMode(override)) throw new Error('Invalid Host sorting override');
    sortModes[id] = override;
  }
  return { sortMode: mode, sortModes };
}
