import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { LanBotSnapshot } from '../../../core/src/devices/bot-lan-control.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { SettingsSection } from './ds/settings-row.js';
import {
  CopyChip,
  StatusBlock,
  StatusDisclosure,
  StatusFact,
  StatusStack,
  type StatusTone,
} from './ds/status-block.js';
import { space } from './ds/tokens.stylex.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  identity: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
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
  const [identity, setIdentity] = useState(false);
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
  const chips = (peer: { hostId: string; fingerprint: string }, well: boolean) => (
    <div {...stylex.props(styles.identity)}>
      <CopyChip
        value={peer.hostId}
        copyLabel={t('devices.botLan.copy')}
        copiedLabel={t('devices.botLan.copied')}
        marker="data-lan-bot-host-id"
        well={well}
      />
      <CopyChip
        value={peer.fingerprint}
        copyLabel={t('devices.botLan.copy')}
        copiedLabel={t('devices.botLan.copied')}
        marker="data-lan-bot-fingerprint"
        well={well}
      />
    </div>
  );
  const peerTone = (peer: Peer): StatusTone =>
    peer.identityChanged
      ? 'warning'
      : !peer.discovered
        ? 'neutral'
        : peer.admitted
          ? 'success'
          : 'accent';
  const listening = snapshot.state === 'listening';
  return (
    <div ref={rootRef}>
      <SettingsSection title={t('devices.botLan.title')} description={t('devices.botLan.scope')}>
        <StatusStack data={{ 'data-lan-bot': snapshot.state }}>
          <StatusBlock
            icon={listening ? 'laptop' : 'info'}
            tone={listening ? 'neutral' : 'warning'}
            title={snapshot.host.name}
            body={
              listening
                ? t('devices.botLan.thisHost')
                : t(
                    snapshot.state === 'error'
                      ? 'devices.botLan.discoveryFailed'
                      : 'devices.botLan.enableFirst',
                  )
            }
            data={{ 'data-lan-bot-host': '' }}
          />
          {snapshot.peers.length === 0 ? (
            <StatusBlock
              icon="search"
              tone="neutral"
              title={t('devices.botLan.emptyTitle')}
              body={t('devices.botLan.empty')}
              data={{ 'data-lan-bot-empty': '' }}
            />
          ) : (
            snapshot.peers.map((peer) => {
              const tone = peerTone(peer);
              return (
                <StatusBlock
                  key={peer.hostId}
                  icon={tone === 'success' ? 'check' : tone === 'warning' ? 'info' : 'laptop'}
                  tone={tone}
                  title={peer.name}
                  body={t(
                    peer.identityChanged
                      ? 'devices.botLan.identityChanged'
                      : !peer.discovered
                        ? 'devices.botLan.offline'
                        : peer.admitted
                          ? 'devices.botLan.approved'
                          : 'devices.botLan.discovered',
                  )}
                  data={{ 'data-lan-bot-peer': peer.hostId }}
                  action={
                    <Button
                      variant={peer.approval ? 'outline' : 'primary'}
                      size="sm"
                      disabled={
                        !fresh || busy || (!peer.approval && (!peer.discovered || !listening))
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
              );
            })
          )}
          <StatusDisclosure
            icon="lock"
            title={t('devices.botLan.identity')}
            hint={t('devices.botLan.identityHint')}
            open={identity}
            onToggle={() => setIdentity(!identity)}
            data={{ 'data-lan-bot-identity': '' }}
          >
            <StatusFact label={t('devices.botLan.thisHost')}>
              {chips(snapshot.host, false)}
            </StatusFact>
          </StatusDisclosure>
        </StatusStack>
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
          <StatusStack>
            <StatusBlock
              icon={review.action === 'admit' ? 'shield-check' : 'ban'}
              tone={!permitted || failed ? 'warning' : 'accent'}
              title={review.peer.name}
              body={t(
                review.action === 'admit' ? 'devices.botLan.compare' : 'devices.botLan.revokeScope',
              )}
              data={{ 'data-lan-bot-review': review.action }}
            >
              {chips(review.peer, false)}
            </StatusBlock>
            {!permitted ? <Note tone="danger">{t('devices.botLan.changed')}</Note> : null}
            {failed ? <Note tone="danger">{t('devices.botLan.failed')}</Note> : null}
          </StatusStack>
        </PanelDialog>
      ) : null}
    </div>
  );
}
