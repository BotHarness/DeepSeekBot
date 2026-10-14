import { useId, useState, useSyncExternalStore, type ReactElement } from 'react';
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MemoryWorkingChange } from './bridge.js';
import { channelSidebarPrefs } from './channel-sidebar-prefs.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  groupedMemoryChanges,
  memoryChangeBadge,
  type MemoryChangeGroup,
} from './memory-working-presentation.js';
import { Note } from './ds/note.js';

function groupLabel(id: MemoryChangeGroup, t: BotHarnessTranslate): string {
  switch (id) {
    case 'new':
      return t('memory.newMemory');
    case 'updated':
      return t('memory.updatedMemory');
    case 'unstaged':
      return t('memory.unstaged');
    case 'staged':
      return t('memory.staged');
    case 'untracked':
      return t('memory.untracked');
  }
}

export function MemoryWorkingGroups({
  changes,
  selected,
  onSelect,
  t,
}: {
  changes: readonly MemoryWorkingChange[];
  selected: MemoryWorkingChange | undefined;
  onSelect: ((change: MemoryWorkingChange) => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const terminology = useSyncExternalStore(
    channelSidebarPrefs.subscribe,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<MemoryChangeGroup>>(new Set());
  const groups = groupedMemoryChanges(changes, terminology);

  return (
    <div className="bh-memory-working-list" aria-label={t('memory.workingDiff')}>
      {groups.every((group) => group.changes.length === 0) ? (
        <Note tone="subtle" inset>
          {t('memory.noChanges')}
        </Note>
      ) : (
        groups.map((group) => {
          if (group.changes.length === 0) return null;
          const open = !collapsed.has(group.id);
          const bodyId = `${id}-${group.id}`;
          return (
            <div key={group.id} className="bh-memory-change-group">
              <button
                type="button"
                className="bh-memory-change-heading"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              >
                <span className={open ? '' : 'bh-chevron-collapsed'} aria-hidden="true">
                  <IconChevronDownOutlineRegular size={14} />
                </span>
                <span>{groupLabel(group.id, t)}</span>
                <span className="bh-memory-change-count">{group.changes.length}</span>
              </button>
              {open ? (
                <div id={bodyId} className="bh-memory-change-rows">
                  {group.changes.map((change) => {
                    const badge = memoryChangeBadge(change, terminology);
                    const badgeText =
                      terminology === 'git'
                        ? badge
                        : badge === 'new'
                          ? t('memory.badge.new')
                          : badge === 'deleted'
                            ? t('memory.badge.deleted')
                            : t('memory.badge.updated');
                    return (
                      <button
                        key={`${change.kind}:${change.path}`}
                        type="button"
                        className={
                          selected?.path === change.path && selected.kind === change.kind
                            ? 'bh-memory-row bh-memory-row-selected'
                            : 'bh-memory-row'
                        }
                        aria-pressed={
                          selected?.path === change.path && selected.kind === change.kind
                        }
                        onClick={() => onSelect?.(change)}
                      >
                        <span className="bh-memory-change-badge" data-status={badge}>
                          {badgeText}
                        </span>
                        <span className="bh-memory-change-path" title={change.path}>
                          {change.path}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
