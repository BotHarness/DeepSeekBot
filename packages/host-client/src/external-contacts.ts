import type {
  ExternalContact,
  ExternalContactBlockChange,
  ExternalContactBot,
  ExternalContactListQuery,
} from '@botharness/host-protocol/external-contacts';
import { answer, answerRecord, record, strings, text, type HostCall } from './host-answer';

function isContactBot(value: unknown): value is ExternalContactBot {
  const row = record(value);
  return (
    !!row &&
    text(row['slug']) &&
    ['paired', 'blocked', 'requested', 'unpaired'].some((status) => status === row['status']) &&
    strings(row['roleIds']) &&
    typeof row['canSpeak'] === 'boolean' &&
    typeof row['personBlocked'] === 'boolean' &&
    typeof row['hasLegacyBlock'] === 'boolean'
  );
}

function isContact(value: unknown): value is ExternalContact {
  const row = record(value);
  return (
    !!row &&
    text(row['id']) &&
    text(row['platform']) &&
    text(row['actorId']) &&
    (row['workspaceId'] === null || text(row['workspaceId'])) &&
    (row['name'] === null || text(row['name'])) &&
    strings(row['accessibleBotSlugs']) &&
    Array.isArray(row['bots']) &&
    row['bots'].every(isContactBot)
  );
}

export async function readExternalContacts(host: HostCall, query: ExternalContactListQuery = {}) {
  const method = 'externalContacts';
  const result = answerRecord(await host.call(method, { query }), method);
  const contacts = answer(
    result['contacts'],
    (value): value is ExternalContact[] => Array.isArray(value) && value.every(isContact),
    method,
  );
  return { contacts };
}

export async function setExternalContactBlock(host: HostCall, input: ExternalContactBlockChange) {
  const method = 'externalContactBlock';
  const result = answerRecord(await host.call(method, { input }), method);
  const blocked = answer(
    result['blocked'],
    (value): value is boolean => typeof value === 'boolean',
    method,
  );
  return { blocked };
}
