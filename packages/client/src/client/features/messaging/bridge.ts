import { asRecord, BridgeCallError, unwrap, type BridgeCall } from '../../bridge-transport.js';
import type { HostFileTarget } from '../../host-file-actions.js';
import type {
  PairingRequest,
  PairingReviewInput,
  SenderAccessInput,
  MessagingDefaults,
  MessagingDefaultsInput,
  ChannelBridgeInput,
  ChannelBridgeSnapshot,
  MessagingIdentity,
  MessagingIdentityInput,
  GroupReceptionInput,
  MessagingConversationInput,
  ExternalSource,
  ConversationIngestInput,
  ConversationIngestSnapshot,
  MessagingApp,
  MessagingSnapshot,
  MessagingReadMode,
  MessagingGrant,
  OutboxIntent,
  MessagingTarget,
  MessagingReachablePage,
  ThreadReceptionInput,
} from '../../bridge.js';

export async function manageMessagingIdentity(
  call: BridgeCall,
  slug: string,
  input: MessagingIdentityInput,
): Promise<MessagingIdentity> {
  const record = asRecord(await unwrap(call, 'messagingIdentity', { slug, input }));
  const identity = asRecord(record?.['identity']);
  if (
    !identity ||
    typeof identity['id'] !== 'string' ||
    typeof identity['revision'] !== 'number' ||
    typeof identity['enabled'] !== 'boolean'
  )
    throw new BridgeCallError('invalid-response', 'Invalid identity result');
  return identity as unknown as MessagingIdentity;
}

export async function loadMessagingDefaults(
  call: BridgeCall,
  platform: MessagingDefaultsInput['platform'] = 'feishu',
): Promise<MessagingDefaults> {
  const value = asRecord(
    await unwrap(call, 'messagingDefaults', platform === 'feishu' ? {} : { platform }),
  );
  if (
    !value ||
    value['platform'] !== platform ||
    !Number.isInteger(value['revision']) ||
    Number(value['revision']) < 0 ||
    typeof value['changedAt'] !== 'string' ||
    typeof value['identityEnabled'] !== 'boolean' ||
    (platform === 'weixin' && typeof value['typingEnabled'] !== 'boolean') ||
    !['mentions', 'all'].includes(String(value['collection'])) ||
    !['immediate', 'digest', 'mentions', 'silent'].includes(String(value['wake'])) ||
    !Number.isInteger(value['count']) ||
    !Number.isInteger(value['intervalSeconds']) ||
    Number(value['count']) < 1 ||
    Number(value['count']) > 100 ||
    Number(value['intervalSeconds']) < 1 ||
    Number(value['intervalSeconds']) > 86400
  )
    throw new BridgeCallError('invalid-response', 'Invalid platform defaults');
  return value as unknown as MessagingDefaults;
}

export async function saveMessagingDefaults(
  call: BridgeCall,
  input: MessagingDefaultsInput,
): Promise<MessagingDefaults> {
  await unwrap(call, 'messagingDefaultsSet', { input });
  return loadMessagingDefaults(call, input.platform);
}

function validReceptionRecovery(value: unknown): boolean {
  if (value === undefined) return true;
  const row = asRecord(value);
  if (row?.['kind'] === 'action-required')
    return typeof row['reason'] === 'string' && row['reason'].length > 0;
  return (
    row?.['kind'] === 'retrying' &&
    row['reason'] === 'provider-unavailable' &&
    Number.isSafeInteger(row['attempt']) &&
    Number(row['attempt']) > 0 &&
    typeof row['nextRetryAt'] === 'string' &&
    Number.isFinite(Date.parse(row['nextRetryAt']))
  );
}

export async function loadChannelBridges(
  call: BridgeCall,
  channelId: string,
  mode?: MessagingReadMode,
): Promise<ChannelBridgeSnapshot> {
  const value = asRecord(
    await unwrap(call, 'channelBridges', {
      channelId,
      ...(mode ? { mode } : {}),
    }),
  );
  const source = (item: unknown) => {
    const row = asRecord(item);
    return (
      row &&
      ['grantId', 'botSlug', 'platform', 'accountName', 'conversationName'].every(
        (key) => typeof row[key] === 'string',
      ) &&
      Number.isInteger(row['grantRevision']) &&
      Number(row['grantRevision']) > 0 &&
      ['verified', 'unverified'].includes(String(row['ordinaryDelivery']))
    );
  };
  if (
    !value ||
    value['channelId'] !== channelId ||
    (value['checks'] !== undefined && !['pending', 'complete'].includes(String(value['checks']))) ||
    (value['canTargetInbox'] !== undefined && typeof value['canTargetInbox'] !== 'boolean') ||
    (value['receptionNeedsAttention'] !== undefined &&
      typeof value['receptionNeedsAttention'] !== 'boolean') ||
    !Array.isArray(value['sources']) ||
    !value['sources'].every(source) ||
    !Array.isArray(value['bridges']) ||
    !value['bridges'].every((item) => {
      const row = asRecord(item);
      return (
        source(item) &&
        (row?.['routeId'] === undefined || typeof row['routeId'] === 'string') &&
        (row?.['delivery'] === undefined ||
          ['channel', 'inbox'].includes(String(row['delivery']))) &&
        typeof row?.['name'] === 'string' &&
        typeof row['enabled'] === 'boolean' &&
        Number.isInteger(row['revision']) &&
        Number(row['revision']) > 0 &&
        ['mentions', 'all'].includes(String(row['collection'])) &&
        ['available', 'unavailable', 'rebind-required'].includes(String(row['availability'])) &&
        ['off', 'connecting', 'receiving', 'unavailable'].includes(String(row['reception'])) &&
        validReceptionRecovery(row['recovery'])
      );
    })
  )
    throw new BridgeCallError('invalid-response', 'Invalid Channel Bridge snapshot');
  return value as unknown as ChannelBridgeSnapshot;
}

export async function loadChannelIngests(
  call: BridgeCall,
  channelId: string,
): Promise<ConversationIngestSnapshot> {
  const value = asRecord(await unwrap(call, 'channelIngests', { channelId }));
  if (
    !value ||
    value['channelId'] !== channelId ||
    !Array.isArray(value['ingests']) ||
    !value['ingests'].every((item) => {
      const row = asRecord(item);
      const conversation = asRecord(row?.['conversation']);
      const wake = asRecord(row?.['wake']);
      return (
        row &&
        conversation &&
        wake &&
        ['id', 'channelId', 'platform', 'accountName', 'intakeAfter'].every(
          (key) => typeof row[key] === 'string',
        ) &&
        typeof conversation['id'] === 'string' &&
        typeof conversation['name'] === 'string' &&
        typeof row['enabled'] === 'boolean' &&
        Number.isInteger(row['revision']) &&
        ['mentions', 'digest', 'all'].includes(String(wake['mode'])) &&
        ['waiting', 'receiving', 'paused', 'unavailable'].includes(String(row['state']))
      );
    }) ||
    !Array.isArray(value['candidates']) ||
    !value['candidates'].every((item) => {
      const row = asRecord(item);
      return (
        row &&
        ['bindingId', 'botSlug', 'platform', 'accountName'].every(
          (key) => typeof row[key] === 'string',
        ) &&
        Array.isArray(row['conversations'])
      );
    })
  )
    throw new BridgeCallError('invalid-response', 'Invalid external conversation snapshot');
  return value as unknown as ConversationIngestSnapshot;
}

export async function manageChannelIngest(
  call: BridgeCall,
  channelId: string,
  input: ConversationIngestInput,
): Promise<void> {
  await unwrap(call, 'channelIngest', { channelId, input });
}

export async function manageChannelBridge(
  call: BridgeCall,
  channelId: string,
  input: ChannelBridgeInput,
): Promise<void> {
  await unwrap(call, 'channelBridge', { channelId, input });
}

export async function setFailureAlerts(
  call: BridgeCall,
  slug: string,
  enabled: boolean,
  expectedRevision: number,
): Promise<void> {
  await unwrap(call, 'failureAlertsSet', { slug, enabled, expectedRevision });
}

export async function testFailureAlerts(call: BridgeCall, slug: string): Promise<void> {
  await unwrap(call, 'failureAlertsTest', { slug });
}

export async function retryFailureAlerts(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<void> {
  await unwrap(call, 'failureAlertsRetry', { slug, id });
}

export async function reviewPairing(
  call: BridgeCall,
  slug: string,
  input: PairingReviewInput,
): Promise<PairingRequest> {
  const value = asRecord(await unwrap(call, 'pairingReview', { slug, input }));
  const pairing = asRecord(value?.['pairing']);
  if (
    !pairing ||
    pairing['botSlug'] !== slug ||
    typeof pairing['id'] !== 'string' ||
    !Array.isArray(pairing['capabilities']) ||
    typeof pairing['revision'] !== 'number'
  )
    throw new BridgeCallError('invalid-response', 'Invalid pairing review');
  return pairing as unknown as PairingRequest;
}

export async function changeExternalSenderAccess(
  call: BridgeCall,
  slug: string,
  input: SenderAccessInput,
): Promise<void> {
  await unwrap(call, 'senderAccess', { slug, input });
}

export async function loadMessagingApps(call: BridgeCall): Promise<{
  apps: MessagingApp[];
  setups: NonNullable<MessagingSnapshot['appSetups']>;
}> {
  const record = asRecord(await unwrap(call, 'messagingApps', {}));
  const apps = record?.['apps'];
  const setups = record?.['setups'];
  if (
    !Array.isArray(apps) ||
    !Array.isArray(setups) ||
    !setups.every((value) => typeof asRecord(value)?.['providerId'] === 'string') ||
    !apps.every((value) => {
      const app = asRecord(value);
      return (
        typeof app?.['providerId'] === 'string' &&
        typeof app['ref'] === 'string' &&
        typeof app['platform'] === 'string' &&
        typeof app['name'] === 'string' &&
        typeof app['fingerprint'] === 'string' &&
        typeof app['connected'] === 'boolean' &&
        (app['boundBotSlug'] === undefined || typeof app['boundBotSlug'] === 'string')
      );
    })
  )
    throw new BridgeCallError('invalid-response', 'Invalid messaging apps');
  return {
    apps: apps as MessagingApp[],
    setups: setups as NonNullable<MessagingSnapshot['appSetups']>,
  };
}

export async function loadMessagingSnapshot(
  call: BridgeCall,
  slug: string,
  mode?: MessagingReadMode,
): Promise<MessagingSnapshot> {
  const value = await unwrap(call, 'messagingSnapshot', {
    slug,
    ...(mode ? { mode } : {}),
  });
  const record = asRecord(value);
  if (
    !record ||
    (record['checks'] !== undefined &&
      !['pending', 'complete'].includes(String(record['checks']))) ||
    !Array.isArray(record['accounts']) ||
    !Array.isArray(record['grants']) ||
    !record['grants'].every((item: unknown) =>
      validReceptionRecovery(asRecord(item)?.['recovery']),
    ) ||
    (record['identities'] !== undefined &&
      (!Array.isArray(record['identities']) ||
        !record['identities'].every((item: unknown) =>
          validReceptionRecovery(asRecord(item)?.['recovery']),
        ))) ||
    !Array.isArray(record['intents']) ||
    (record['setup'] !== undefined && !validLarkSetupSnapshot(record['setup'])) ||
    (record['channelTargets'] !== undefined &&
      (!Array.isArray(record['channelTargets']) ||
        !record['channelTargets'].every((value) => {
          const target = asRecord(value);
          return (
            typeof target?.['id'] === 'string' &&
            target['id'].length > 0 &&
            typeof target['name'] === 'string'
          );
        })))
  )
    throw new BridgeCallError('invalid-response', 'Invalid messaging snapshot');
  return value as MessagingSnapshot;
}

function validLarkSetupSnapshot(value: unknown): boolean {
  const setup = asRecord(value);
  return (
    typeof setup?.['providerReady'] === 'boolean' &&
    Array.isArray(setup['receipts']) &&
    setup['receipts'].length <= 20 &&
    setup['receipts'].every((item: unknown) => {
      const row = asRecord(item);
      return (
        !!row &&
        ['sourceEventId', 'grantId', 'messageId', 'conversationId', 'at'].every(
          (key) => typeof row[key] === 'string' && row[key].length > 0,
        ) &&
        typeof row['echoObserved'] === 'boolean' &&
        (row['replyMessageId'] === undefined ||
          (typeof row['replyMessageId'] === 'string' && row['replyMessageId'].length > 0)) &&
        (row['threadId'] === undefined || typeof row['threadId'] === 'string') &&
        (row['replyState'] === undefined ||
          [
            'provider-accepted',
            'unknown-outcome',
            'pending',
            'in-flight',
            'grant-revoked',
            'cancelled',
            'failed',
          ].includes(String(row['replyState'])))
      );
    })
  );
}

export async function loadMessagingTargets(
  call: BridgeCall,
  providerId: string,
  accountRef: string,
): Promise<MessagingTarget[]> {
  const record = asRecord(await unwrap(call, 'messagingTargets', { providerId, accountRef }));
  if (!record || !Array.isArray(record['targets']))
    throw new BridgeCallError('invalid-response', 'Invalid targets');
  return record['targets'] as MessagingTarget[];
}

export async function authorizeMessaging(
  call: BridgeCall,
  input: {
    botSlug: string;
    providerId: string;
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
  },
): Promise<MessagingGrant> {
  const record = asRecord(await unwrap(call, 'messagingAuthorize', input));
  if (!record || !asRecord(record['grant']))
    throw new BridgeCallError('invalid-response', 'Invalid grant');
  return record['grant'] as MessagingGrant;
}

export async function revokeMessaging(
  call: BridgeCall,
  slug: string,
  grantId: string,
): Promise<void> {
  await unwrap(call, 'messagingRevoke', { slug, grantId });
}

export async function loadMessagingReachable(
  call: BridgeCall,
  slug: string,
  bindingId: string,
  cursor?: string,
): Promise<MessagingReachablePage> {
  const page = asRecord(
    await unwrap(call, 'messagingReachable', {
      slug,
      bindingId,
      ...(cursor ? { cursor } : {}),
    }),
  );
  if (
    !page ||
    page['version'] !== 1 ||
    !Array.isArray(page['conversations']) ||
    typeof page['hasMore'] !== 'boolean'
  )
    throw new BridgeCallError('invalid-response', 'Invalid group page');
  return page as unknown as MessagingReachablePage;
}

export async function readMessagingPostRequest(
  call: BridgeCall,
  slug: string,
  bindingId: string,
  conversationId: string,
  requestId: string,
  text: string,
): Promise<OutboxIntent | undefined> {
  const record = asRecord(
    await unwrap(call, 'messagingPostRequest', {
      slug,
      bindingId,
      conversationId,
      requestId,
      text,
    }),
  );
  if (record?.['intent'] === null) return undefined;
  if (!record || !asRecord(record['intent']))
    throw new BridgeCallError('invalid-response', 'Invalid intent');
  return record['intent'] as OutboxIntent;
}

export async function postMessagingConversation(
  call: BridgeCall,
  slug: string,
  bindingId: string,
  conversationId: string,
  requestId: string,
  text: string,
): Promise<OutboxIntent> {
  const record = asRecord(
    await unwrap(call, 'messagingPostConversation', {
      slug,
      bindingId,
      conversationId,
      requestId,
      text,
    }),
  );
  if (!record || !asRecord(record['intent']))
    throw new BridgeCallError('invalid-response', 'Invalid intent');
  return record['intent'] as OutboxIntent;
}

export async function setMessagingPostLimit(
  call: BridgeCall,
  slug: string,
  bindingId: string,
  expectedRevision: number,
  limit: number | null,
): Promise<void> {
  await unwrap(call, 'messagingPostLimit', {
    slug,
    bindingId,
    expectedRevision,
    limit,
  });
}

export async function sendMessaging(
  call: BridgeCall,
  slug: string,
  grantId: string,
  requestId: string,
  text: string,
): Promise<OutboxIntent> {
  const record = asRecord(await unwrap(call, 'messagingSend', { slug, grantId, requestId, text }));
  if (!record || !asRecord(record['intent']))
    throw new BridgeCallError('invalid-response', 'Invalid intent');
  return record['intent'] as OutboxIntent;
}

export async function loadChannelMediaTarget(
  call: BridgeCall,
  channelId: string,
  sourceEventId: string,
  attachmentId: string,
): Promise<HostFileTarget> {
  const response = asRecord(
    await unwrap(call, 'channelMediaTarget', {
      channelId,
      sourceEventId,
      attachmentId,
    }),
  );
  const target = asRecord(response?.['target']);
  if (
    typeof target?.['path'] !== 'string' ||
    typeof target['relativePath'] !== 'string' ||
    target['kind'] !== 'file'
  )
    throw new Error('Invalid Channel media target');
  return {
    path: target['path'],
    relativePath: target['relativePath'],
    kind: 'file',
  };
}

export async function setMessagingChannelTarget(
  call: BridgeCall,
  slug: string,
  grantId: string,
  channelId: string | null,
): Promise<void> {
  await unwrap(call, 'messagingChannelTarget', { slug, grantId, channelId });
}

export async function setMessagingThreadPolicy(
  call: BridgeCall,
  slug: string,
  sourceEventId: string,
  policy: ThreadReceptionInput,
): Promise<void> {
  await unwrap(call, 'messagingThreadPolicy', { slug, sourceEventId, policy });
}

export async function setMessagingGroupPolicy(
  call: BridgeCall,
  slug: string,
  grantId: string,
  policy: GroupReceptionInput,
): Promise<void> {
  await unwrap(call, 'messagingGroupPolicy', { slug, grantId, policy });
}

export async function manageMessagingConversation(
  call: BridgeCall,
  slug: string,
  input: MessagingConversationInput,
): Promise<void> {
  await unwrap(call, 'messagingConversation', { slug, input });
}

export async function setMessagingReceive(
  call: BridgeCall,
  slug: string,
  grantId: string,
  enabled: boolean,
): Promise<void> {
  await unwrap(call, 'messagingReceive', { slug, grantId, enabled });
}

export async function readMessagingSource(
  call: BridgeCall,
  slug: string,
  sourceEventId: string,
): Promise<ExternalSource> {
  const record = asRecord(await unwrap(call, 'messagingSource', { slug, sourceEventId }));
  const source = asRecord(record?.['source']);
  const event = asRecord(source?.['event']);
  const actor = asRecord(event?.['actor']);
  const conversation = asRecord(event?.['conversation']);
  const reply = asRecord(event?.['reply']);
  const replay = asRecord(event?.['replay']);
  const strings = (value: Record<string, unknown> | undefined, keys: string[]): boolean =>
    value !== undefined && keys.every((key) => typeof value[key] === 'string');
  if (
    !strings(source, [
      'body',
      'id',
      'platform',
      'accountName',
      'conversationName',
      'at',
      'grantId',
    ]) ||
    (source?.['localChannelId'] !== undefined &&
      (typeof source['localChannelId'] !== 'string' || source['localChannelId'].length === 0)) ||
    !Number.isInteger(source?.['grantRevision']) ||
    Number(source?.['grantRevision']) < 1 ||
    event?.['version'] !== 1 ||
    !['feishu', 'slack', 'discord', 'weixin', 'qq'].includes(String(event['channel'])) ||
    !strings(event, ['botId', 'fingerprint', 'eventId', 'messageId', 'at']) ||
    typeof event['mentionedAccount'] !== 'boolean' ||
    actor?.['kind'] !== 'user' ||
    !strings(actor, ['id']) ||
    (actor?.['name'] !== undefined && typeof actor['name'] !== 'string') ||
    !['group', 'dm'].includes(String(conversation?.['kind'])) ||
    !strings(conversation, ['id']) ||
    !strings(reply, ['messageId', 'conversationId', 'actorId']) ||
    ['threadId', 'rootId', 'parentId'].some(
      (key) => reply?.[key] !== undefined && typeof reply[key] !== 'string',
    ) ||
    !Array.isArray(event['mentions']) ||
    !event['mentions'].every(
      (mention) =>
        strings(asRecord(mention), ['id', 'key']) &&
        (asRecord(mention)?.['name'] === undefined ||
          typeof asRecord(mention)?.['name'] === 'string'),
    ) ||
    (event['attachments'] !== undefined &&
      (!Array.isArray(event['attachments']) ||
        event['attachments'].length > 1 ||
        !event['attachments'].every(
          (file) =>
            strings(asRecord(file), ['id', 'messageId', 'resourceKey', 'name']) &&
            (asRecord(file)?.['sizeBytes'] === undefined ||
              (Number.isSafeInteger(asRecord(file)?.['sizeBytes']) &&
                Number(asRecord(file)?.['sizeBytes']) > 0 &&
                Number(asRecord(file)?.['sizeBytes']) <= Number.MAX_SAFE_INTEGER)) &&
            (asRecord(file)?.['mediaType'] === undefined ||
              typeof asRecord(file)?.['mediaType'] === 'string'),
        ))) ||
    replay?.['kind'] !== 'provider-redelivery' ||
    replay['resumeCursor'] !== false ||
    replay['gapPossible'] !== true
  )
    throw new BridgeCallError('invalid-response', 'Invalid source');
  if (
    source?.['receptionPaths'] !== undefined &&
    (!Array.isArray(source['receptionPaths']) ||
      !source['receptionPaths'].every((value) => {
        const path = asRecord(value);
        return (
          path &&
          strings(path, ['routeId', 'grantId', 'reason', 'mode']) &&
          (path['channelId'] === null || typeof path['channelId'] === 'string') &&
          ['group-mention', 'group-ordinary', 'human-dm'].includes(String(path['reason'])) &&
          ['all', 'immediate', 'digest', 'mentions', 'silent', 'context', 'conditional'].includes(
            String(path['mode']),
          ) &&
          [
            'grantRevision',
            'routeRevision',
            'count',
            'intervalMs',
            'policyRevision',
            'sourceRevision',
            'defaultRevision',
          ].every((key) => Number.isInteger(path[key]))
        );
      }))
  )
    throw new BridgeCallError('invalid-response', 'Invalid reception paths');
  if (
    source?.['contextReads'] !== undefined &&
    (!Array.isArray(source['contextReads']) ||
      source['contextReads'].length > 20 ||
      !source['contextReads'].every((value) => {
        const read = asRecord(value);
        return (
          strings(read, ['at', 'sessionId', 'scope', 'outcome']) &&
          ['group', 'nearby', 'thread', 'retained', 'retained-nearby'].includes(
            String(read?.['scope']),
          ) &&
          (read?.['coverage'] === undefined ||
            ['provider-visible-human-text', 'retained-local-sources'].includes(
              String(read['coverage']),
            )) &&
          ['read', 'refused'].includes(String(read?.['outcome'])) &&
          typeof read?.['incomplete'] === 'boolean' &&
          Number.isInteger(read?.['omitted']) &&
          Array.isArray(read?.['sourceEventIds']) &&
          read['sourceEventIds'].length <= 20 &&
          read['sourceEventIds'].every((id: unknown) => typeof id === 'string') &&
          (read['reason'] === undefined || typeof read['reason'] === 'string')
        );
      }))
  )
    throw new BridgeCallError('invalid-response', 'Invalid context audit');
  if (
    source?.['contextMessages'] !== undefined &&
    (!Array.isArray(source['contextMessages']) ||
      source['contextMessages'].length > 20 ||
      !source['contextMessages'].every((value) => {
        const message = asRecord(value);
        const senderName = message?.['senderName'];
        const mentions = message?.['mentions'];
        return (
          strings(message, ['sourceEventId', 'messageId', 'senderId', 'at', 'text']) &&
          (senderName === undefined || typeof senderName === 'string') &&
          (mentions === undefined ||
            (Array.isArray(mentions) &&
              mentions.every((value: unknown) => {
                const mention = asRecord(value);
                const name = mention?.['name'];
                return (
                  strings(mention, ['id', 'key']) &&
                  (name === undefined || typeof name === 'string')
                );
              })))
        );
      }))
  )
    throw new BridgeCallError('invalid-response', 'Invalid context messages');
  return source as unknown as ExternalSource;
}
