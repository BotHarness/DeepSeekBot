import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export async function runChannelApprovalGate(s, fx, tag, check, shellQuote) {
  const newGroup = (bot, name, humans, as) => {
    const result = s.cli(['group-create', name, '--member', bot, '--operation-key', randomUUID()], {
      as,
    });
    const channelId = result.channel?.id ?? result.channelId ?? result.id;
    for (const humanId of humans) s.cli(['channels', 'add-member', channelId, humanId], { as });
    return channelId;
  };
  const policy = (channelId, roleId, actions, as) => {
    const { policy } = s.cli(['channels', 'policy', channelId], { as });
    s.cli(['channels', 'policy', channelId, '--policy-stdin'], {
      as,
      input: JSON.stringify({ ...policy, overrides: [{ roleId, actions }] }),
    });
  };
  const marker = `approvalfixture${tag.replaceAll('-', '')}`;
  const request = async (channelId, bot, label, viewer) => {
    const target = join(s.dir, `approval-${label}-${tag}.txt`);
    const command = `printf %s ${shellQuote(marker + label)} > ${shellQuote(target)}`;
    const before = new Set(s.messages(channelId, viewer).map(({ id }) => id));
    s.cli(
      [
        'channels',
        'send',
        channelId,
        '--body-stdin',
        '--mention-bot',
        bot,
        '--mention-label',
        label,
      ],
      {
        input: `Write the marker to this isolated QA scratch directory, which is outside your workspace. Call native Bash exactly once with command ${command}, sandbox_permissions "danger-full-access", and justification "Write the authorized QA marker to the scratch directory outside my workspace." Wait for the Human's one-shot decision before writing. Do not retry or change standing permissions.`,
      },
    );
    const deadline = Date.now() + s.options.timeout * 1000;
    while (Date.now() < deadline) {
      const card = s
        .messages(channelId, viewer)
        .find(
          (message) =>
            !before.has(message.id) &&
            ['bash', 'shell'].includes(message.toolApprovalRequest?.toolName) &&
            message.toolApprovalRequest?.input?.includes(marker + label),
        );
      if (card) return card.id;
      await new Promise((done) => setTimeout(done, 2500));
    }
    throw new Error('The Bot did not present the expected Shell approval card.');
  };
  const decide = (channelId, messageId, outcome, as, expect) =>
    s.cli(['tool-approval-decide', channelId, '--message-id', messageId, '--outcome', outcome], {
      as,
      expect,
    });
  const status = (channelId, messageId, as) =>
    s.cli(['tool-approval-status', channelId, '--message-id', messageId], { as });
  const group = newGroup(fx.ledgerSlug, `Approval review ${tag}`, [fx.humans.bob.humanId]);
  const bob = fx.users.bob;
  const roleId = fx.roles.creators.roleId;
  const readPolicy = (channelId, as) => s.cli(['channels', 'policy', channelId], { as });
  const card = await request(group, fx.ledgerSlug, 'Owner');
  check(
    'new Channel has legacy approval access with --as',
    readPolicy(group, bob).approvalPolicy?.see === 'eligible-deciders' &&
      status(group, card, bob).approval?.masked === true &&
      status(group, card).approval?.masked === false,
  );
  decide(group, card, 'allowed-once', bob, 'approval-not-allowed');
  s.cli(['channels', 'policy', group, '--post', 'deny']);
  const afterPost = readPolicy(group, bob);
  check(
    'changing post keeps the legacy masked card',
    afterPost.policy?.everyone?.post === 'deny' &&
      afterPost.approvalPolicy?.mode === 'legacy' &&
      status(group, card, bob).approval?.masked === true,
  );
  policy(group, roleId, { seeApprovals: 'allow', decideApprovals: 'deny' });
  check(
    'changing approval rules enables view-only access with --as',
    readPolicy(group, bob).approvalPolicy?.mode === 'channel' &&
      status(group, card, bob).approval?.canDecide === false &&
      s
        .messages(group, bob)
        .find(({ id }) => id === card)
        ?.toolApprovalRequest?.input?.includes(marker),
  );
  decide(group, card, 'allowed-once', bob, 'approval-not-allowed');
  policy(group, roleId, { seeApprovals: 'deny', decideApprovals: 'deny' });
  const masked = s.messages(group, bob).find(({ id }) => id === card);
  const search = s.cli(['message-search', '--query', marker], { as: bob });
  const activity = s.cli(['activity', '--notifications', '--limit', '100'], { as: bob });
  const notification = activity.items?.find(({ messageId }) => messageId === card);
  check(
    'masked card, Search and notification feed omit approval inputs with --as',
    masked?.approval?.masked === true &&
      !search.hits?.some(({ message }) => message.id === card) &&
      notification?.approval?.masked === true &&
      !JSON.stringify([masked, notification]).includes(marker),
  );
  policy(group, roleId, { seeApprovals: 'deny', decideApprovals: 'allow' });
  check(
    'decision right implies visibility with --as',
    status(group, card, bob).approval?.masked === false,
  );
  check(
    'Channel reviewer can decide with --as',
    decide(group, card, 'rejected', bob).accepted === true,
  );

  const manager = s.cli([
    'roles',
    'create',
    '--name',
    `Grant managers ${tag}`,
    '--permissions',
    'bots.manageGrants,channels.create',
  ]).role;
  const originalRoles = ['member', fx.roles.finance.roleId, roleId];
  s.cli([
    'members',
    'roles',
    fx.users.alice,
    '--set',
    [...originalRoles, manager.roleId].join(','),
  ]);
  try {
    const memberGroup = newGroup(
      fx.bots.alice,
      `Member approval ${tag}`,
      [fx.status.viewer.humanId],
      fx.users.alice,
    );
    s.cli(['channels', 'policy', memberGroup, '--use-channel-approvals'], { as: fx.users.alice });
    check(
      'explicit CLI opt-in enables channel approval policy',
      readPolicy(memberGroup, fx.users.alice).approvalPolicy?.mode === 'channel',
    );
    policy(
      memberGroup,
      roleId,
      { seeApprovals: 'allow', decideApprovals: 'allow' },
      fx.users.alice,
    );
    const memberCard = await request(memberGroup, fx.bots.alice, 'Member', fx.users.alice);
    const refusal = decide(
      memberGroup,
      memberCard,
      'allowed-once',
      fx.users.alice,
      'permission-required',
    );
    check(
      'bots.manageGrants cannot authorize the member’s own Shell request even with decideApprovals',
      refusal.error?.details?.permission === 'approvals.opaqueTools',
    );
    decide(memberGroup, memberCard, 'rejected');
  } finally {
    s.cli(['members', 'roles', fx.users.alice, '--set', originalRoles.join(',')]);
  }
}
