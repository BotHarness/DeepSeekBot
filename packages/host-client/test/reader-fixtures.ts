import type { WireTeamMode } from '@botharness/host-protocol/wire';

export function fakeTeamMode(viewer: Partial<WireTeamMode['viewer']> = {}): WireTeamMode {
  const kind = viewer.kind ?? 'owner';
  return {
    enabled: false,
    isolation: 'trial',
    activeMembers: 1,
    ownerPasswordSet: false,
    insecureHttpAllowed: false,
    memberUrls: [],
    viewer: {
      humanId: 'owner',
      displayName: 'Owner',
      mustChangePassword: false,
      models: { all: true },
      permissions: [],
      roleIds: [],
      owner: kind === 'owner',
      ...viewer,
      kind,
    },
  };
}

export function fakeGrantApprovalMessage(requestMessageId: string, grantId: string) {
  return {
    id: 'grant-resolution-' + requestMessageId,
    at: '2026-11-20T00:00:00Z',
    author: { kind: 'human' },
    body: 'I authorized this Workspace for read/write.',
    replyTo: requestMessageId,
    grantRequestResolution: { requestMessageId, grantId },
  };
}
