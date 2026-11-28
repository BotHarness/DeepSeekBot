import {
  pairingCapabilities,
  type ExternalContactAccess,
  type ExternalRoleBotScope,
  type HostExternalRole,
  type PairingCapability,
} from '@botharness/host-protocol/external-roles';
import { BridgeCallError } from '../bridge.js';
import type { BotHarnessTranslate } from '../locale.js';
import type { PermissionChoice } from './permission-model.js';

export { pairingCapabilities, type PairingCapability };

export const CAPABILITY_LABEL = {
  approve: 'pairing.approveCapability',
  reject: 'pairing.rejectCapability',
  answer: 'pairing.answerCapability',
  'save-rules': 'pairing.rulesCapability',
  'review-pairing': 'pairing.reviewCapability',
} as const satisfies Record<PairingCapability, string>;

export type ContactStatus = ExternalContactAccess['status'];

export const CONTACT_STATUS = {
  paired: { label: 'team.externalRoles.status.paired', tone: 'success' },
  visitor: { label: 'team.externalRoles.status.visitor', tone: 'info' },
  unpaired: { label: 'team.externalRoles.status.unpaired', tone: 'neutral' },
  blocked: { label: 'team.externalRoles.status.blocked', tone: 'danger' },
  unavailable: { label: 'team.externalRoles.status.unavailable', tone: 'quiet' },
} as const satisfies Record<ContactStatus, { label: string; tone: string }>;

export const STALE_EXTERNAL_ROLE = 'role-stale';

export function refusalCode(error: unknown): string | undefined {
  return error instanceof BridgeCallError ? error.code : undefined;
}

const REFUSAL_TEXT = {
  [STALE_EXTERNAL_ROLE]: 'team.externalRoles.error.stale',
  'bot-unavailable': 'team.externalRoles.error.botUnavailable',
  'permission-required': 'team.externalRoles.error.permission',
  'invalid-input': 'team.externalRoles.error.invalid',
} as const;

export function externalRoleErrorText(t: BotHarnessTranslate, error: unknown): string {
  const code = refusalCode(error);
  return t(
    code !== undefined && Object.hasOwn(REFUSAL_TEXT, code)
      ? REFUSAL_TEXT[code as keyof typeof REFUSAL_TEXT]
      : 'team.error.generic',
  );
}

export function capabilityChoice(
  role: HostExternalRole,
  capability: PairingCapability,
): PermissionChoice {
  if (role.deniedCapabilities.includes(capability)) return 'deny';
  return role.capabilities.includes(capability) ? 'allow' : 'unset';
}

export function withCapability(
  role: HostExternalRole,
  capability: PairingCapability,
  choice: PermissionChoice,
): Pick<HostExternalRole, 'capabilities' | 'deniedCapabilities' | 'delegableCapabilities'> {
  const capabilities = role.capabilities.filter((item) => item !== capability);
  const deniedCapabilities = role.deniedCapabilities.filter((item) => item !== capability);
  if (choice === 'allow') capabilities.push(capability);
  if (choice === 'deny') deniedCapabilities.push(capability);
  return {
    capabilities,
    deniedCapabilities,
    ...(role.delegableCapabilities === undefined
      ? {}
      : {
          delegableCapabilities: role.delegableCapabilities.filter((item) =>
            capabilities.includes(item),
          ),
        }),
  };
}

export function coversBot(scope: ExternalRoleBotScope, slug: string): boolean {
  return scope.kind === 'all' || scope.botSlugs.includes(slug);
}

export function withBot(
  scope: ExternalRoleBotScope,
  slug: string,
  included: boolean,
): ExternalRoleBotScope {
  if (scope.kind === 'all') return scope;
  const rest = scope.botSlugs.filter((item) => item !== slug);
  return { kind: 'only', botSlugs: included ? [...rest, slug] : rest };
}

export function scopeSummary(
  t: BotHarnessTranslate,
  scope: ExternalRoleBotScope,
  botName: (slug: string) => string,
): string {
  if (scope.kind === 'all') return t('team.externalRoles.scope.allShort');
  if (scope.botSlugs.length === 0) return t('team.externalRoles.scope.none');
  return scope.botSlugs.map(botName).join(t('team.externalRoles.listSeparator'));
}
