import { useState, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { ReachablePostDialog } from './reachable-post.js';
import type { MessagingIdentityView } from '../../../core/src/messaging/identity.js';

import { ApprovalSettings } from './approval-settings.js';
import { sameBotNames, useClientStore } from './use-client-store.js';
import { ChannelBridgeAttention, ChannelBridgeList } from './channel-bridge-list.js';
import type { ChannelSettingsAttentionProps, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { ExternalIdentityList } from './external-identity-list.js';
import { MessagingGrantRow } from './messaging-grant.js';
import { useMessagingSnapshot } from './messaging-store.js';
import { PairingSettings } from './pairing-settings.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

function IdentitiesForBot({
  slug,
  actions,
  t,
}: {
  slug: string;
  actions: ChannelSidebarEntryProps['actions'];
  t: ChannelSidebarEntryProps['t'];
}): ReactElement {
  const { snapshot, failed, refresh, mount } = useMessagingSnapshot(slug, actions);
  const dm = useClientStore((state) =>
    state.channels.find((c) => c.type === 'dm' && c.botSlug === slug),
  );
  const bots = useClientStore((state) => state.bots, sameBotNames);
  const composerIdentity = useClientStore((state) => state.composerIdentity);
  const bot = bots.find((b) => b.slug === slug);
  const syncChannels = [
    ...(dm ? [{ id: dm.id, name: t('bridge.dmTarget', { name: bot?.displayName ?? slug }) }] : []),
    ...(snapshot?.channelTargets ?? []),
  ];
  const [postIdentity, setPostIdentity] = useState<MessagingIdentityView>();
  const [panel, setPanel] = useState<'pairing' | 'approval'>();
  const [busy, setBusy] = useState(false);
  const [scopeFailed, setScopeFailed] = useState<'pairing' | 'approval'>();
  const operate = async (
    operation: () => Promise<void>,
    scope: 'pairing' | 'approval',
    propagate = false,
  ) => {
    if (busy) return;
    setBusy(true);
    setScopeFailed(undefined);
    try {
      await operation();
      await refresh();
    } catch {
      setScopeFailed(scope);
      if (propagate) throw new Error('pairing-operation-failed');
    } finally {
      setBusy(false);
    }
  };
  const pairings = snapshot?.pairings ?? [];
  const pending = pairings.filter((request) => request.status === 'pending').length;
  const approved = pairings.filter((request) => request.status === 'approved').length;
  const route = snapshot?.approvals?.route;
  const destination = snapshot?.approvals?.destinations.find(
    (item) => item.pairingId === route?.pairingId,
  );
  return (
    <div ref={mount} className="bh-external-entry">
      {failed ? (
        <p className="bh-error" role="alert">
          {t('im.error')}
        </p>
      ) : null}
      {postIdentity ? (
        <ReachablePostDialog
          key={postIdentity.id}
          slug={slug}
          identity={postIdentity}
          recoveryScope={
            composerIdentity === undefined
              ? undefined
              : JSON.stringify([
                  composerIdentity.hostId,
                  composerIdentity.profileId,
                  composerIdentity.humanId,
                ])
          }
          actions={actions}
          t={t}
          refresh={refresh}
          onClose={() => setPostIdentity(undefined)}
        />
      ) : null}
      <ExternalIdentityList
        post={setPostIdentity}
        appSetup={actions.appSetup ? { client: actions.appSetup, botSlug: slug } : undefined}
        snapshot={snapshot}
        refresh={refresh}
        t={t}
        mutate={async (input) => {
          await actions.messagingIdentity(slug, input);
          await refresh();
        }}
        conversation={async (input) => {
          await actions.messagingConversation(slug, input);
          await refresh();
        }}
        rules={async (grantId, input) => {
          await actions.messagingGroupPolicy(slug, grantId, input);
          await refresh();
        }}
        channels={syncChannels}
        syncChannels={snapshot?.channelTargets ?? []}
        sync={async (grant, channelId, enabled) => {
          const route = grant.bridgeRoutes?.find((item) => item.channelId === channelId);
          const input = {
            grantId: grant.id,
            expectedGrantRevision: grant.revision,
            delivery: 'channel' as const,
            name: route?.name ?? grant.targetName,
            enabled,
            collection: route?.collection ?? 'mentions',
            collectionInheritance: route?.collectionInheritance ?? 'inherit',
            ...(grant.groupPolicy?.defaultRevision !== undefined
              ? { expectedDefaultRevision: grant.groupPolicy.defaultRevision }
              : {}),
          };
          try {
            await actions.channelBridge(
              channelId,
              route
                ? { ...input, kind: 'update', routeId: route.id, expectedRevision: route.revision }
                : { ...input, kind: 'add' },
            );
          } catch (error) {
            await refresh().catch(() => undefined);
            throw error;
          }
          await refresh();
        }}
        botName={(owner) => bots.find((item) => item.slug === owner)?.displayName ?? owner}
      />
      <SidebarCardList label={t('pairing.title')}>
        <SidebarCardRow
          icon="user-check"
          title={t('pairing.title')}
          chips={
            pending > 0 ? (
              <Tag tone="info">{t('pairing.pendingCount', { count: pending })}</Tag>
            ) : undefined
          }
          meta={t('pairing.approvedCount', { count: approved })}
          dialog
          onClick={() => setPanel('pairing')}
        />
        <SidebarCardRow
          icon="shield-check"
          title={t('approvalIm.title')}
          meta={destination === undefined ? t('approvalIm.off') : destination.name}
          muted={destination === undefined}
          dialog
          onClick={() => setPanel('approval')}
        />
      </SidebarCardList>
      {panel === 'pairing' ? (
        <PanelDialog
          size="wide"
          fill
          onClose={() => setPanel(undefined)}
          title={t('pairing.title')}
          closeLabel={t('common.close')}
          data={{ 'data-pairing-panel': '', 'data-external-panel': '' }}
        >
          <PairingSettings
            requests={pairings}
            roles={snapshot?.roles ?? []}
            groups={snapshot?.permissionGroups ?? []}
            behaviorPermissions={snapshot?.behaviorPermissions ?? []}
            bindings={(snapshot?.identities ?? [])
              .filter(
                (binding) => binding.enabled && !binding.revokedAt && binding.platform === 'feishu',
              )
              .map((binding) => ({ id: binding.id, name: binding.name }))}
            {...(snapshot?.senderPolicy ? { policy: snapshot.senderPolicy } : {})}
            senderAccess={(input) =>
              operate(() => actions.senderAccess(slug, input), 'pairing', true)
            }
            receivers={snapshot?.pairingReceivers ?? []}
            busy={busy}
            failed={scopeFailed === 'pairing'}
            refresh={() => operate(async () => undefined, 'pairing')}
            review={(input) =>
              operate(async () => {
                await actions.pairingReview(slug, input);
              }, 'pairing')
            }
            t={t}
          />
        </PanelDialog>
      ) : null}
      {panel === 'approval' ? (
        <PanelDialog
          size="wide"
          fill
          onClose={() => setPanel(undefined)}
          title={t('approvalIm.title')}
          closeLabel={t('common.close')}
          data={{ 'data-pairing-panel': '', 'data-external-panel': '' }}
          actions={
            <Button variant="outline" onClick={() => setPanel(undefined)}>
              {t('common.close')}
            </Button>
          }
        >
          <ApprovalSettings
            key={`approval-${snapshot?.approvals?.routeRevision ?? 0}`}
            {...(snapshot?.approvals ? { snapshot: snapshot.approvals } : {})}
            busy={busy}
            failed={scopeFailed === 'approval'}
            t={t}
            save={(pairingId, revision) =>
              operate(() => actions.approvalRoute(slug, pairingId, revision), 'approval')
            }
            test={() => operate(() => actions.approvalTest(slug), 'approval')}
            retry={(id) => operate(() => actions.approvalRetry(slug, id), 'approval')}
            refresh={() => operate(async () => undefined, 'approval')}
            openSession={actions.openSession}
            failureAlerts={{
              ...(snapshot?.failureAlerts ? { snapshot: snapshot.failureAlerts } : {}),
              save: (enabled, revision) =>
                operate(() => actions.failureAlertsSet(slug, enabled, revision), 'approval'),
              test: () => operate(() => actions.failureAlertsTest(slug), 'approval'),
              retry: (id) => operate(() => actions.failureAlertsRetry(slug, id), 'approval'),
            }}
          />
        </PanelDialog>
      ) : null}
    </div>
  );
}

export function ExternalIdentitiesEntry({
  botSlug,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  if (botSlug === undefined) return <></>;
  return <IdentitiesForBot key={botSlug} slug={botSlug} actions={actions} t={t} />;
}

export function ExternalConnectorsAttention({
  channelId,
  actions,
  report,
}: ChannelSettingsAttentionProps): ReactElement {
  return <ChannelBridgeAttention channelId={channelId} actions={actions} report={report} />;
}

export function ExternalConnectorsEntry({
  botSlug,
  channelId,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const botName = useClientStore(
    (state) => state.bots.find((item) => item.slug === botSlug)?.displayName,
  );
  const channelName = useClientStore(
    (state) => state.channels.find((item) => item.id === channelId)?.name,
  );
  if (botSlug === undefined) return <></>;
  return (
    <ChannelBridgeList
      key={`${botSlug}:${channelId}`}
      channelId={channelId}
      channelName={channelName ?? botName ?? botSlug}
      botNames={new Map([[botSlug, botName ?? botSlug]])}
      actions={actions}
      t={t}
    >
      <MessagingGrantRow slug={botSlug} actions={actions} t={t} />
    </ChannelBridgeList>
  );
}
