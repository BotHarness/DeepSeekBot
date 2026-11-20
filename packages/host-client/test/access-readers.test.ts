import { fakeGrantApprovalMessage } from './reader-fixtures';
import { describe, expect, it, vi } from 'vitest';
import {
  approveGrantRequest,
  createGrant,
  readAssignmentAccess,
  readWorkspaceGrants,
  revokeGrant,
  writeAssignmentAccess,
} from '../src/access-readers';
import { HostAnswerInvalid } from '../src/host-answer';

const host = (value: unknown) => ({ call: vi.fn().mockResolvedValue(value) });
const preset = { botSlug: 'tea', revision: 0, mode: 'workspace-write' as const };
const grant = {
  id: 'grant',
  botSlug: 'tea',
  workspaceId: 'workspace',
  workspacePath: '/tea',
  workspaceTitle: 'Tea',
  createdAt: '2026-11-20T00:00:00Z',
};
const args = { slug: 'tea', workspaceId: 'workspace' };
const scoped = { ...args, scope: { channelId: 'group-a', path: '/tea' } };
const approval = { ...args, channelId: 'dm-tea', requestMessageId: 'request' };
const approvalMessage = fakeGrantApprovalMessage(approval.requestMessageId, grant.id);

describe('Assignment access', () => {
  it.each([
    (value: unknown) => readAssignmentAccess(host(value), 'tea'),
    (value: unknown) =>
      writeAssignmentAccess(host(value), { slug: 'tea', mode: 'workspace-write' }),
  ])('requires a complete preset, including any supplied scope or change time', async (read) => {
    await expect(read({ preset })).resolves.toEqual({ preset });
    const extended = { ...preset, scope: 'assignments', changedAt: grant.createdAt };
    await expect(read({ preset: extended })).resolves.toEqual({ preset: extended });
    for (const change of [
      { botSlug: 'other' },
      { revision: undefined },
      { revision: -1 },
      { scope: false },
      { changedAt: null },
    ])
      await expect(read({ preset: { ...preset, ...change } })).rejects.toBeInstanceOf(
        HostAnswerInvalid,
      );
  });
});

describe('Workspace Grants', () => {
  it('accepts valid lists and creation, approval, and revocation receipts', async () => {
    await expect(readWorkspaceGrants(host({ grants: [grant] }), { slug: 'tea' })).resolves.toEqual({
      grants: [grant],
    });
    await expect(createGrant(host({ grant }), args)).resolves.toEqual({ grant });
    await expect(createGrant(host({ grant, created: true }), scoped)).resolves.toEqual({
      grant,
      created: true,
    });
    const authorized = { ...grant, orchestratorWrite: true, writeRevision: 1 };
    const approve = host({ grant: authorized, message: approvalMessage });
    await expect(approveGrantRequest(approve, approval)).resolves.toEqual({
      grant: authorized,
      message: approvalMessage,
    });
    expect(approve.call).toHaveBeenCalledWith('grantRequestApprove', {
      ...approval,
      acknowledgeReadWrite: true,
    });
    const revoked = { ...authorized, revokedAt: grant.createdAt };
    await expect(
      revokeGrant(host({ grant: revoked }), { slug: 'tea', grantId: 'grant' }),
    ).resolves.toEqual({ grant: revoked });
  });

  it.each([
    { createdAt: undefined },
    { botSlug: 'other' },
    { revokedAt: null },
    { orchestratorWrite: 'true' },
    { writeRevision: -1 },
  ])('rejects malformed rows across all grant methods %j', async (change) => {
    const malformed = { ...grant, orchestratorWrite: true, ...change };
    await expect(
      readWorkspaceGrants(host({ grants: [malformed] }), { slug: 'tea' }),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
    await expect(createGrant(host({ grant: malformed }), args)).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
    await expect(
      approveGrantRequest(host({ grant: malformed, message: approvalMessage }), approval),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
    await expect(
      revokeGrant(host({ grant: malformed }), { slug: 'tea', grantId: 'grant' }),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it('requires scoped creation confirmation, write permission on approval and the exact grant on revoke', async () => {
    for (const value of [
      { grant },
      { grant, created: 'yes' },
      { grant: { ...grant, workspaceId: 'wrong' }, created: true },
    ])
      await expect(createGrant(host(value), scoped)).rejects.toBeInstanceOf(HostAnswerInvalid);
    await expect(
      approveGrantRequest(host({ grant, message: approvalMessage }), approval),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
    await expect(
      revokeGrant(host({ grant }), { slug: 'tea', grantId: 'other' }),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it.each([{ humanId: 7 }, { displayName: null }, { deleted: 'true' }])(
    'rejects an invalid optional grant-approval author field %j',
    async (change) => {
      const message = { ...approvalMessage, author: { ...approvalMessage.author, ...change } };
      await expect(
        approveGrantRequest(
          host({ grant: { ...grant, orchestratorWrite: true }, message }),
          approval,
        ),
      ).rejects.toBeInstanceOf(HostAnswerInvalid);
    },
  );
});
