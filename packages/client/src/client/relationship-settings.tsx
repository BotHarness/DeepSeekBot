import { useRef, useState } from 'react';
import { relationshipListSchema } from '../../../core/src/devices/relationship-contract.js';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { noiseFingerprint } from '../../../core/src/devices/noise/xk.js';
import { keyBytes } from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import type { BotHarnessTranslate } from './locale.js';
import { relationshipRequest, type ClientRelationship } from './relationships.js';
import { remoteHosts } from './remote-hosts.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { ConfirmDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { useMountedResource } from './mounted-resource.js';

export function RelationshipSettings({ t }: { t: BotHarnessTranslate }) {
  const [items, setItems] = useState<ClientRelationship[]>([]);
  const [confirm, setConfirm] = useState<{
    item: ClientRelationship;
    action: 'approve' | 'disconnect';
  }>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const abort = useRef<AbortController>();
  const approved = useRef<string>();
  const working = useRef(false);
  const join = async (item: ClientRelationship) => {
    const source = remoteHosts();
    if (source.getSnapshot().hosts.some((entry) => entry.host.hostId === item.peer.id)) return;
    const result = await source.enrollRelationship(
      item.id,
      'Desktop browser',
      abort.current?.signal,
    );
    if (!result.ok && result.code !== 'already-paired') throw new Error('enrollment-failed');
  };
  const load = async () => {
    if (working.current || abort.current?.signal.aborted) return;
    working.current = true;
    try {
      const result = relationshipListSchema.parse(
        await relationshipRequest(undefined, abort.current?.signal),
      );
      if (abort.current?.signal.aborted) return;
      setItems(result.relationships);
      const ready = result.relationships.find(
        (item) => item.id === approved.current && item.state === 'active',
      );
      if (ready) {
        approved.current = undefined;
        await join(ready);
      }
      setLoadFailed(false);
    } catch {
      if (!abort.current?.signal.aborted) setLoadFailed(true);
    } finally {
      working.current = false;
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    abort.current = new AbortController();
    void load();
    const timer = setInterval(() => {
      void load();
    }, 2000);
    return () => {
      clearInterval(timer);
      abort.current?.abort();
    };
  }, []);
  const perform = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    setFailed(false);
    const { item, action } = confirm;
    try {
      await relationshipRequest(
        { action, id: item.id, confirmedKey: item.peer.publicKey, confirm: true },
        abort.current?.signal,
      );
      if (action === 'approve') approved.current = item.id;
      if (!abort.current?.signal.aborted) {
        setConfirm(undefined);
        await load();
      }
    } catch {
      if (!abort.current?.signal.aborted) setFailed(true);
    } finally {
      if (!abort.current?.signal.aborted) setBusy(false);
    }
  };
  return (
    <div ref={mount}>
      {items.length ? (
        <SettingsSection title={t('relationships.title')}>
          {items.map((item) => (
            <SettingsRow
              key={item.id}
              title={item.peer.name}
              description={t(
                item.state === 'disconnected'
                  ? item.peerRevocationPending
                    ? 'relationships.revocationPending'
                    : 'relationships.disconnected'
                  : item.state === 'active'
                    ? 'relationships.authorized'
                    : 'relationships.pending',
              )}
              control={
                <>
                  {item.direction === 'incoming' && item.state === 'pending' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirm({ item, action: 'approve' })}
                    >
                      {t('relationships.review')}
                    </Button>
                  ) : null}
                  {item.state === 'active' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        setFailed(false);
                        void join(item)
                          .catch(() => {
                            if (!abort.current?.signal.aborted) setFailed(true);
                          })
                          .finally(() => {
                            if (!abort.current?.signal.aborted) setBusy(false);
                          });
                      }}
                    >
                      {t('relationships.open')}
                    </Button>
                  ) : null}
                  {item.state !== 'disconnected' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirm({ item, action: 'disconnect' })}
                    >
                      {t('relationships.disconnect')}
                    </Button>
                  ) : null}
                </>
              }
            />
          ))}
        </SettingsSection>
      ) : null}
      {failed || loadFailed ? <Note tone="warning">{t('relationships.failed')}</Note> : null}
      {confirm ? (
        <ConfirmDialog
          title={t(
            confirm.action === 'approve' ? 'relationships.approve' : 'relationships.disconnect',
          )}
          description={t(
            confirm.action === 'approve'
              ? 'relationships.approveHint'
              : 'relationships.disconnectHint',
            { name: confirm.item.peer.name },
          )}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t(
            confirm.action === 'approve' ? 'connect.matches' : 'relationships.disconnect',
          )}
          busy={busy}
          danger={confirm.action === 'disconnect'}
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => {
            void perform();
          }}
        >
          {confirm.action === 'approve' ? (
            <code>{noiseFingerprint(keyBytes(confirm.item.peer.publicKey))}</code>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
