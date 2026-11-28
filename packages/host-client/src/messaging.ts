import type {
  MessagingConnection,
  MessagingConnectionsView,
  ReceptionRecovery,
} from '@botharness/host-protocol/messaging-connections';
import type { MessagingIdentity, MessagingIdentityInput } from '../../core/src/messaging/identity';
import type {
  MessagingApp,
  MessagingReadMode,
  MessagingSnapshot,
} from '../../core/src/messaging/outbound-types';
import type { PairingRequest, PairingReviewInput } from '../../core/src/messaging/pairing';
import type { SenderAccessInput } from '../../core/src/messaging/permissions/index.js';
import { answerRecord, HostAnswerInvalid, record, type HostCall } from './host-answer';

export type MessagingAppSetup = NonNullable<MessagingSnapshot['appSetups']>[number];

export interface MessagingApps {
  apps: MessagingApp[];
  setups: MessagingAppSetup[];
}

export function validReceptionRecovery(value: unknown): value is ReceptionRecovery | undefined {
  if (value === undefined) return true;
  const row = record(value);
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

export async function readMessagingConnections(
  host: HostCall,
  mode?: MessagingReadMode,
): Promise<MessagingConnectionsView> {
  const result = answerRecord(
    await host.call('messagingConnections', mode === undefined ? {} : { mode }),
    'messagingConnections',
  );
  const { checks } = result;
  if ((checks !== 'pending' && checks !== 'complete') || !Array.isArray(result.bindings))
    throw new HostAnswerInvalid('Invalid messaging connections');
  const bindings = result.bindings.map((value: unknown): MessagingConnection => {
    const row = record(value);
    if (row === undefined) throw new HostAnswerInvalid('Invalid messaging connection');
    const {
      id,
      botSlug,
      botName,
      canOpenSettings,
      providerId,
      platform,
      accountRef,
      name,
      enabled,
      availability,
      reception,
      recovery,
    } = row;
    if (
      typeof id !== 'string' ||
      typeof botSlug !== 'string' ||
      typeof botName !== 'string' ||
      typeof canOpenSettings !== 'boolean' ||
      typeof providerId !== 'string' ||
      typeof platform !== 'string' ||
      typeof accountRef !== 'string' ||
      typeof name !== 'string' ||
      typeof enabled !== 'boolean' ||
      (availability !== 'available' &&
        availability !== 'paused' &&
        availability !== 'unavailable' &&
        availability !== 'rebind-required') ||
      (reception !== 'off' &&
        reception !== 'connecting' &&
        reception !== 'receiving' &&
        reception !== 'unavailable') ||
      !validReceptionRecovery(recovery)
    )
      throw new HostAnswerInvalid('Invalid messaging connection');
    return {
      id,
      botSlug,
      botName,
      canOpenSettings,
      providerId,
      platform,
      accountRef,
      name,
      enabled,
      availability,
      reception,
      ...(recovery === undefined ? {} : { recovery }),
    };
  });
  return { checks, bindings };
}

const REPLY_STATES = [
  'provider-accepted',
  'unknown-outcome',
  'pending',
  'in-flight',
  'grant-revoked',
  'cancelled',
  'failed',
];

function validLarkSetupSnapshot(value: unknown): boolean {
  const setup = record(value);
  return (
    typeof setup?.['providerReady'] === 'boolean' &&
    Array.isArray(setup['receipts']) &&
    setup['receipts'].length <= 20 &&
    setup['receipts'].every((item: unknown) => {
      const row = record(item);
      return (
        !!row &&
        ['sourceEventId', 'grantId', 'messageId', 'conversationId', 'at'].every(
          (key) => typeof row[key] === 'string' && row[key].length > 0,
        ) &&
        typeof row['echoObserved'] === 'boolean' &&
        (row['replyMessageId'] === undefined ||
          (typeof row['replyMessageId'] === 'string' && row['replyMessageId'].length > 0)) &&
        (row['threadId'] === undefined || typeof row['threadId'] === 'string') &&
        (row['replyState'] === undefined || REPLY_STATES.includes(String(row['replyState'])))
      );
    })
  );
}

function validApp(value: unknown): boolean {
  const app = record(value);
  return (
    typeof app?.['providerId'] === 'string' &&
    typeof app['ref'] === 'string' &&
    typeof app['platform'] === 'string' &&
    typeof app['name'] === 'string' &&
    typeof app['fingerprint'] === 'string' &&
    typeof app['connected'] === 'boolean' &&
    (app['boundBotSlug'] === undefined || typeof app['boundBotSlug'] === 'string')
  );
}

export async function readMessagingApps(host: HostCall): Promise<MessagingApps> {
  const answer = record(await host.call('messagingApps', {}));
  const apps = answer?.['apps'];
  const setups = answer?.['setups'];
  if (
    !Array.isArray(apps) ||
    !Array.isArray(setups) ||
    !setups.every((value) => typeof record(value)?.['providerId'] === 'string') ||
    !apps.every(validApp)
  )
    throw new HostAnswerInvalid('Invalid messaging apps');
  return { apps: apps as MessagingApp[], setups: setups as MessagingAppSetup[] };
}

export async function readMessagingSnapshot(
  host: HostCall,
  slug: string,
  mode?: MessagingReadMode,
): Promise<MessagingSnapshot> {
  const value = await host.call('messagingSnapshot', { slug, ...(mode ? { mode } : {}) });
  const answer = record(value);
  if (
    !answer ||
    (answer['checks'] !== undefined &&
      !['pending', 'complete'].includes(String(answer['checks']))) ||
    !Array.isArray(answer['accounts']) ||
    !Array.isArray(answer['grants']) ||
    !answer['grants'].every((item: unknown) =>
      validReceptionRecovery(record(item)?.['recovery']),
    ) ||
    (answer['identities'] !== undefined &&
      (!Array.isArray(answer['identities']) ||
        !answer['identities'].every((item: unknown) =>
          validReceptionRecovery(record(item)?.['recovery']),
        ))) ||
    (answer['pairings'] !== undefined &&
      (!Array.isArray(answer['pairings']) ||
        !answer['pairings'].every(
          (item) =>
            typeof record(item)?.['id'] === 'string' &&
            typeof record(item)?.['status'] === 'string',
        ))) ||
    (answer['roles'] !== undefined && !Array.isArray(answer['roles'])) ||
    !Array.isArray(answer['intents']) ||
    (answer['setup'] !== undefined && !validLarkSetupSnapshot(answer['setup'])) ||
    (answer['channelTargets'] !== undefined &&
      (!Array.isArray(answer['channelTargets']) ||
        !answer['channelTargets'].every((item) => {
          const target = record(item);
          return (
            typeof target?.['id'] === 'string' &&
            target['id'].length > 0 &&
            typeof target['name'] === 'string'
          );
        })))
  )
    throw new HostAnswerInvalid('Invalid messaging snapshot');
  return value as MessagingSnapshot;
}

export async function changeMessagingIdentity(
  host: HostCall,
  slug: string,
  input: MessagingIdentityInput,
): Promise<MessagingIdentity> {
  const identity = record(
    record(await host.call('messagingIdentity', { slug, input }))?.['identity'],
  );
  if (
    !identity ||
    typeof identity['id'] !== 'string' ||
    typeof identity['revision'] !== 'number' ||
    typeof identity['enabled'] !== 'boolean'
  )
    throw new HostAnswerInvalid('Invalid identity result');
  return identity as unknown as MessagingIdentity;
}

export async function reviewPairingRequest(
  host: HostCall,
  slug: string,
  input: PairingReviewInput,
): Promise<PairingRequest> {
  const pairing = record(record(await host.call('pairingReview', { slug, input }))?.['pairing']);
  if (
    !pairing ||
    pairing['botSlug'] !== slug ||
    typeof pairing['id'] !== 'string' ||
    !Array.isArray(pairing['capabilities']) ||
    typeof pairing['revision'] !== 'number'
  )
    throw new HostAnswerInvalid('Invalid pairing review');
  return pairing as unknown as PairingRequest;
}

export async function changeSenderAccess(
  host: HostCall,
  slug: string,
  input: SenderAccessInput,
): Promise<void> {
  await host.call('senderAccess', { slug, input });
}
