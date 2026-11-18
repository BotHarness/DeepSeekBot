import type { ConnectionState } from '@botharness/host-client/client';
import type { SavedHost } from '@botharness/host-client/hosts';
import type { BotHarnessTranslate } from './locale.js';

export function memberStatus(
  host: SavedHost,
  connection: ConnectionState,
  t: BotHarnessTranslate,
): string | undefined {
  if (host.member === undefined) return undefined;
  if (connection.status === 'refused' && connection.code === 'sign-in-required')
    return t('environment.signInRequired');
  if (connection.status === 'refused' && connection.code === 'member-suspended')
    return t('environment.memberSuspended');
  return undefined;
}
