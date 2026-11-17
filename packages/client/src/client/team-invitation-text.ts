import { parseTeamInvitation } from '@botharness/host-protocol/team-invitation';

import type { BridgeCall } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { record, unwrap } from './team-bridge.js';

export interface MemberInvitation {
  readonly link: string;
  readonly qr: { size: number; path: string };
  readonly expiresAt: string;
}

export async function loadMemberInvitation(
  call: BridgeCall,
  humanId: string,
): Promise<MemberInvitation> {
  const row = record(await unwrap(call, 'memberInvitation', { humanId }));
  const qr = record(row?.['qr']);
  if (
    typeof row?.['link'] !== 'string' ||
    typeof row['expiresAt'] !== 'string' ||
    typeof qr?.['size'] !== 'number' ||
    typeof qr['path'] !== 'string'
  )
    throw new Error('invalid memberInvitation response');
  return {
    link: row['link'],
    qr: { size: qr['size'], path: qr['path'] },
    expiresAt: row['expiresAt'],
  };
}

export function invitationText(
  t: BotHarnessTranslate,
  input: {
    link: string;
    username: string;
    address: string | undefined;
    password: string | undefined;
  },
): string {
  const parsed = parseTeamInvitation(input.link, 0);
  const host = parsed.ok ? parsed.value.host : undefined;
  return [
    t('team.invite.text.intro', { host: host?.name ?? '' }),
    t('team.invite.text.phone', { link: input.link }),
    ...(input.address === undefined
      ? []
      : [t('team.invite.text.desktop', { address: input.address })]),
    t('team.invite.text.username', { username: input.username }),
    ...(input.password === undefined
      ? []
      : [t('team.invite.text.password', { password: input.password })]),
    ...(host === undefined
      ? []
      : [t('team.invite.text.fingerprint', { fingerprint: host.fingerprint })]),
    t('team.invite.text.expires'),
  ].join('\n');
}
