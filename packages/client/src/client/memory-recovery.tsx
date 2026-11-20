import { Button } from './ds/button.js';
import { Fragment, useState, useSyncExternalStore, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import type { MemoryRecoveryCheckpoint } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

type RecoverySnapshot = {
  checkpoints: MemoryRecoveryCheckpoint[];
  error?: string;
};

const stores = new WeakMap<BridgeActions, Map<string, ReturnType<typeof createRecoveryStore>>>();

function createRecoveryStore(actions: BridgeActions, channelId: string) {
  let snapshot: RecoverySnapshot = { checkpoints: [] };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loading = false;
  const publish = (next: RecoverySnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const load = (): void => {
    if (loading || listeners.size === 0 || document.visibilityState === 'hidden') return;
    loading = true;
    void actions
      .memoryRecoveryHistory(channelId)
      .then(
        (checkpoints) => publish({ checkpoints }),
        (failure: unknown) =>
          publish({
            checkpoints: snapshot.checkpoints,
            error: failure instanceof Error ? failure.message : String(failure),
          }),
      )
      .finally(() => {
        loading = false;
        if (listeners.size > 0) timer = setTimeout(load, 20_000);
      });
  };
  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(timer);
    load();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (listeners.size === 1) {
        load();
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearTimeout(timer);
          window.removeEventListener('focus', onVisible);
          document.removeEventListener('visibilitychange', onVisible);
        }
      };
    },
    reload(): void {
      clearTimeout(timer);
      load();
    },
  };
}

function recoveryStore(
  actions: BridgeActions,
  channelId: string,
  refreshRevision: number | string | undefined,
) {
  let channels = stores.get(actions);
  if (channels === undefined) {
    channels = new Map();
    stores.set(actions, channels);
  }
  const key = `${channelId}:${refreshRevision ?? 0}`;
  let store = channels.get(key);
  if (store === undefined) {
    store = createRecoveryStore(actions, channelId);
    channels.set(key, store);
    if (channels.size > 30) channels.delete(channels.keys().next().value!);
  }
  return store;
}

export function MemoryRecovery({
  actions,
  channelId,
  refreshRevision,
  onRestored,
  t,
}: {
  actions: BridgeActions;
  channelId: string;
  refreshRevision: number | string | undefined;
  onRestored: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const source = recoveryStore(actions, channelId, refreshRevision);
  const { checkpoints, error: loadError } = useSyncExternalStore(
    source.subscribe,
    source.getSnapshot,
    source.getSnapshot,
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [archivePath, setArchivePath] = useState<string>();

  const current = checkpoints[0];
  const selected = checkpoints.find((point) => point.id === selectedId);
  const restore = async (): Promise<void> => {
    if (selected === undefined || current === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await actions.memoryRestore({
        channelId,
        checkpointId: selected.id,
        expectedCurrentId: current.id,
      });
      setArchivePath(result.archivePath);
      setSelectedId(undefined);
      setConfirming(false);
      source.reload();
      onRestored();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setConfirming(false);
      source.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bh-memory-recovery">
      {(error ?? loadError) === undefined ? null : (
        <div className="bh-error" role="alert">
          {error ?? loadError}
        </div>
      )}
      {archivePath === undefined ? null : (
        <details className="bh-note bh-memory-recovery-archive" role="status">
          <summary>{t('memory.backups.done')}</summary>
          <code>{archivePath}</code>
        </details>
      )}
      {checkpoints.length === 0 && loadError === undefined ? (
        <div className="bh-note">{t('memory.backups.empty')}</div>
      ) : null}
      <div className="bh-memory-recovery-list" role="list" aria-label={t('memory.backups.title')}>
        {checkpoints.map((point, index) => (
          <Fragment key={point.id}>
            <button
              type="button"
              role="listitem"
              data-checkpoint-id={point.id}
              className="bh-memory-recovery-row"
              aria-pressed={point.id === selectedId}
              title={`${point.branch} · ${point.head.slice(0, 7)}`}
              onClick={() => {
                setSelectedId(point.id === selectedId ? undefined : point.id);
                setConfirming(false);
              }}
            >
              <span className="bh-memory-recovery-main">
                <span>{new Date(point.capturedAt).toLocaleString()}</span>
                {index === 0 ? (
                  <span className="bh-memory-ref">{t('memory.backups.latest')}</span>
                ) : null}
              </span>
              <span className="bh-memory-recovery-meta">
                {t(`memory.backups.cause.${point.causeKind}`)}
              </span>
            </button>
            {point.id !== selectedId || index === 0 ? null : (
              <div className="bh-memory-recovery-confirm">
                {confirming ? (
                  <>
                    <p>
                      {t('memory.backups.confirm', {
                        time: new Date(point.capturedAt).toLocaleString(),
                      })}
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void restore()}
                    >
                      {busy ? t('memory.backups.restoring') : t('memory.backups.restore')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                  >
                    {t('memory.backups.choose')}
                  </Button>
                )}
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
