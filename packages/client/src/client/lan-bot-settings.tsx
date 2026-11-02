import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { LanBotSnapshot } from '../../../core/src/devices/bot-lan-control.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { space, text } from './ds/tokens.stylex.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  identity: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    overflowWrap: 'anywhere',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});
type Peer = LanBotSnapshot['peers'][number];

export function LanBotSettings({
  t,
  snapshot,
  fresh,
  onChanged,
}: PropsLocale<'botharness'> & {
  snapshot: LanBotSnapshot;
  fresh: boolean;
  onChanged(): void;
}): ReactElement {
  const [review, setReview] = useState<{ peer: Peer; action: 'admit' | 'revoke' }>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController>();
  const mounted = useRef(false);
  const rootRef = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, []);
  const current = snapshot.peers.find((peer) => peer.hostId === review?.peer.hostId);
  const sameIdentity =
    (review?.action === 'revoke' ? current?.approval?.publicKey : current?.publicKey) ===
    review?.peer.publicKey;
  const permitted =
    fresh &&
    sameIdentity &&
    current !== undefined &&
    (review?.action === 'revoke'
      ? current.approval !== null
      : current.discovered && snapshot.state === 'listening');
  async function confirm() {
    if (!review || !permitted || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('./api/botharness/devices/lan-bots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: review.action,
          hostId: review.peer.hostId,
          ...(review.action === 'admit' ? { publicKey: review.peer.publicKey } : {}),
          confirm: true,
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) throw new Error('lan-approval-failed');
      if (!mounted.current) return;
      setReview(undefined);
      onChanged();
    } catch {
      if (mounted.current) {
        setFailed(true);
        onChanged();
      }
    } finally {
      pending.current = undefined;
      if (mounted.current) setBusy(false);
    }
  }
  const inspect = (peer: Peer, action: 'admit' | 'revoke') => {
    setFailed(false);
    setReview({ peer, action });
  };
  return (
    <div ref={rootRef}>
      <SettingsSection title={t('devices.botLan.title')} description={t('devices.botLan.scope')}>
        <SettingsRow title={snapshot.host.name} description={t('devices.botLan.thisHost')}>
          <details>
            <summary>{t('devices.botLan.identity')}</summary>
            <div {...stylex.props(styles.identity)}>
              <code>{snapshot.host.hostId}</code>
              <code>{snapshot.host.fingerprint}</code>
            </div>
          </details>
        </SettingsRow>
        {snapshot.state !== 'listening' ? (
          <Note>
            {t(
              snapshot.state === 'error'
                ? 'devices.botLan.discoveryFailed'
                : 'devices.botLan.enableFirst',
            )}
          </Note>
        ) : null}
        {snapshot.peers.length === 0 ? (
          <Note>{t('devices.botLan.empty')}</Note>
        ) : (
          snapshot.peers.map((peer) => (
            <SettingsRow
              key={peer.hostId}
              title={peer.name}
              description={t(
                peer.identityChanged
                  ? 'devices.botLan.identityChanged'
                  : !peer.discovered
                    ? 'devices.botLan.offline'
                    : peer.admitted
                      ? 'devices.botLan.approved'
                      : 'devices.botLan.discovered',
              )}
              control={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !fresh ||
                    busy ||
                    (!peer.approval && (!peer.discovered || snapshot.state !== 'listening'))
                  }
                  onClick={() =>
                    inspect(
                      peer.approval ? { ...peer, ...peer.approval } : peer,
                      peer.approval ? 'revoke' : 'admit',
                    )
                  }
                >
                  {t(peer.approval ? 'devices.botLan.revoke' : 'devices.botLan.review')}
                </Button>
              }
            />
          ))
        )}
      </SettingsSection>
      {review ? (
        <PanelDialog
          title={t(review.action === 'admit' ? 'devices.botLan.review' : 'devices.botLan.revoke')}
          closeLabel={t('devices.botLan.cancel')}
          onClose={() => {
            if (!busy) setReview(undefined);
          }}
          secondary={
            <Button variant="outline" disabled={busy} onClick={() => setReview(undefined)}>
              {t('devices.botLan.cancel')}
            </Button>
          }
          actions={
            <Button disabled={!permitted || busy} onClick={() => void confirm()}>
              {t(
                review.action === 'admit'
                  ? 'devices.botLan.confirm'
                  : 'devices.botLan.confirmRevoke',
              )}
            </Button>
          }
        >
          <SettingsRow
            title={review.peer.name}
            description={t(
              review.action === 'admit' ? 'devices.botLan.compare' : 'devices.botLan.revokeScope',
            )}
          >
            <div {...stylex.props(styles.identity)}>
              <code>{review.peer.hostId}</code>
              <code>{review.peer.fingerprint}</code>
            </div>
          </SettingsRow>
          {!permitted ? <Note tone="danger">{t('devices.botLan.changed')}</Note> : null}
          {failed ? <Note tone="danger">{t('devices.botLan.failed')}</Note> : null}
        </PanelDialog>
      ) : null}
    </div>
  );
}
