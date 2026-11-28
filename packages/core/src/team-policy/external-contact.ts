import type { ExternalRoleBotScope } from '@botharness/host-protocol/external-roles';

export function coversBot(scope: ExternalRoleBotScope, botSlug: string): boolean {
  return scope.kind === 'all' || scope.botSlugs.includes(botSlug);
}

export function canExternalContactSpeak(
  pairingRequired: boolean,
  hasApprovedRole: () => boolean,
): boolean {
  return !pairingRequired || hasApprovedRole();
}
