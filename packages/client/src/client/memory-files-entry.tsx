import { useState, useSyncExternalStore, type ReactElement } from 'react';
import type { MemorySnapshot } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { MemoryFileTree } from './memory-file-tree.js';
import { useMountedResource } from './mounted-resource.js';
import { cachedMemory, subscribeMemory } from './memory-read-cache.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { MemoryLoadFeedback } from './memory-load-feedback.js';
import { useClientStore } from './use-client-store.js';
import { SidebarCardList } from './sidebar-card.js';
import { StandingLimitsRow } from './standing-limits.js';
import { PanelEmptyState } from './ds/empty-state.js';

type MemoryFilesProps = ChannelSidebarEntryProps & { showLimits?: boolean };

export function MemoryFilesEntry(props: MemoryFilesProps): ReactElement {
  return <MemoryFilesForScope key={cachedMemory(props.actions, props.channelId).key} {...props} />;
}
function MemoryFilesForScope({
  actions,
  botSlug,
  channelId,
  conversationRevision,
  onMemoryFileSelect,
  selectedMemoryFilePath,
  refreshRevision,
  showLimits = true,
  t,
}: MemoryFilesProps): ReactElement {
  const cache = cachedMemory(actions, channelId);
  const bot = useClientStore(
    (state) => state.bots.find((item) => item.slug === botSlug),
    (left, right) => left?.slug === right?.slug && left?.standingLimits === right?.standingLimits,
  );
  const [snapshot, setSnapshot] = useState<MemorySnapshot | undefined>(cache.snapshot);
  const [error, setError] = useState<string | undefined>(cache.snapshotError);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const invalidated = useSyncExternalStore(
    (listener) => subscribeMemory(cache, listener),
    () => cache.revision,
    () => cache.revision,
  );

  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const load = async (): Promise<void> => {
      if (!active || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(() => void load(), 15_000);
        return;
      }
      inFlight = true;
      setPending(true);
      try {
        const next = await actions.memorySnapshot(channelId);
        if (active) {
          cache.snapshot = next;
          cache.snapshotError = undefined;
          setSnapshot(next);
          setError(undefined);
        }
      } catch (failure) {
        if (active) {
          cache.snapshotError = failure instanceof Error ? failure.message : String(failure);
          setError(cache.snapshotError);
        }
      } finally {
        inFlight = false;
        if (active) setPending(false);
        if (active) timer = setTimeout(() => void load(), 15_000);
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      void load();
    };
    void load();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions, channelId, conversationRevision, refreshRevision, retry, invalidated]);

  return (
    <div className="bh-memory-entry" ref={mount}>
      <MemoryLoadFeedback
        error={error}
        loaded={snapshot !== undefined}
        pending={pending}
        onRetry={() => setRetry((value) => value + 1)}
        t={t}
      />
      {snapshot === undefined ? (
        error === undefined ? (
          <LoadingSkeleton kind="sidebar" label={t('memory.loading')} />
        ) : null
      ) : snapshot.files.length === 0 ? (
        <PanelEmptyState icon="brain">{t('memory.empty')}</PanelEmptyState>
      ) : (
        <MemoryFileTree
          paths={snapshot.files}
          standing={snapshot.standing}
          actions={actions}
          botSlug={botSlug}
          selectedPath={selectedMemoryFilePath}
          onSelect={onMemoryFileSelect}
          t={t}
        />
      )}
      {!showLimits || bot === undefined ? null : (
        <SidebarCardList className="bh-memory-limits" label={t('standingLimits.title')}>
          <StandingLimitsRow key={bot.slug} bot={bot} actions={actions} t={t} />
        </SidebarCardList>
      )}
    </div>
  );
}
