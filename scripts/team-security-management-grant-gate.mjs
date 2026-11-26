export async function runManagementGrantGate(s, { as, target, ownBot, roleIds, tag }, check) {
  const member = { as };
  const holders = (options) => s.cli(['bot-grants'], options).holders ?? [];
  const holds = (slug, capability) =>
    holders().some((holder) => holder.botSlug === slug && holder.capabilities.includes(capability));
  const tob = s.cli(['bot-grants']).tobSlug;
  const privateHome = s.cli(['tob-home'], member);
  check(
    'Member receives no Tob Home or Workspace data',
    Object.keys(privateHome).join(',') === 'available' && privateHome.available === false,
  );
  const memberView = s.cli(['bot-grants'], member);
  check(
    "Member reads only Tob's id and no grant holders",
    memberView.tobSlug === tob && memberView.holders?.length === 0,
    memberView,
  );
  const denied = s.cli(['bot-grant', target, 'manage-app', 'on', '--confirm'], {
    ...member,
    allowFail: true,
  });
  check(
    "A member cannot switch the Owner's Bot",
    denied.error?.code === 'bot-not-found',
    denied.error?.code,
  );
  check('Member denial changes no grant', !holds(target, 'manage-app'));

  const granted = s.cli(['bot-grant', target, 'manage-app', 'on', '--confirm']);
  check(
    'Owner turns on Manage the App and keeps Tob a holder',
    granted.capabilities?.includes('manage-app') &&
      holds(target, 'manage-app') &&
      holds(tob, 'manage-app'),
    granted,
  );
  check('Turning on Manage the App leaves Manage other Bots off', !holds(target, 'manage-bots'));
  check(
    "The Bot's own Human DM contains the Host system marker",
    s
      .messages(`dm-${target}`)
      .some(
        (message) =>
          message.author?.kind === 'system' &&
          message.managementGrant?.botSlug === target &&
          message.managementGrant.capability === 'manage-app' &&
          message.managementGrant.enabled === true,
      ),
  );
  const approvals = s.messages(`dm-${tob}`).filter((message) => message.toolApprovalRequest).length;
  let request = s.cli(['tob-cli', 'start', '--args-stdin'], {
    input: JSON.stringify({ argv: ['bot-grant', target, 'manage-app', 'off'] }),
  });
  const until = Date.now() + 30_000;
  while (request.state === 'running' && Date.now() < until) {
    await new Promise((done) => setTimeout(done, 250));
    request = s.cli(['tob-cli', 'status', request.id]);
  }
  s.transcript('management-grant-cli-refusal', request);
  let refusal = request.code;
  try {
    refusal ??= JSON.parse(request.result?.stdout ?? '').error?.code;
  } catch {}
  check('The broker refuses grant changes from a Bot', refusal === 'cli-command-refused', refusal);
  check(
    'The refusal creates no approval card and changes no grant',
    s.messages(`dm-${tob}`).filter((message) => message.toolApprovalRequest).length === approvals &&
      holds(target, 'manage-app'),
  );
  const revoked = s.cli(['bot-grant', target, 'manage-app', 'off']);
  check('Owner turns the grant off again', !revoked.capabilities?.includes('manage-app'));

  const ownDenied = s.cli(['bot-grant', ownBot, 'manage-app', 'on', '--confirm'], {
    ...member,
    allowFail: true,
  });
  check(
    'Without authorization a member cannot switch their own Bot either',
    ownDenied.error?.code === 'permission-required',
    ownDenied.error?.code,
  );
  const steward = s.cli([
    'roles',
    'create',
    '--name',
    `Grant stewards ${tag}`,
    '--permissions',
    'bots.manageGrants',
  ]).role;
  s.cli(['members', 'roles', as, '--set', [...roleIds, steward.roleId].join(',')]);
  check(
    'An authorized member can switch their own Bot',
    s.cli(['bot-grants', '--bot', ownBot], member).editable === true,
  );
  check(
    "An authorized member still cannot switch the Owner's Bot",
    s.cli(['bot-grants', '--bot', target], { ...member, allowFail: true }).error?.code ===
      'bot-not-found' &&
      s.cli(['bot-grant', target, 'manage-app', 'on', '--confirm'], { ...member, allowFail: true })
        .error?.code === 'bot-not-found' &&
      !holds(target, 'manage-app'),
  );
  const memberOn = s.cli(['bot-grant', ownBot, 'manage-app', 'on', '--confirm'], member);
  const memberHolders = s.cli(['bot-grants'], member).holders ?? [];
  check(
    "The member's own Bot holds Manage the App and the member sees only their own holders",
    memberOn.capabilities?.includes('manage-app') &&
      memberHolders.length === 1 &&
      memberHolders[0].botSlug === ownBot,
    { memberOn, memberHolders },
  );
  check("The Owner's list stays the Owner's Bots", !holds(ownBot, 'manage-app'));
  s.cli(['members', 'roles', as, '--set', roleIds.join(',')]);
  const withdrawn = s.cli(['bot-grants'], member);
  check(
    "Withdrawing the authorization stops the member Bot's grant",
    withdrawn.holders?.length === 0 && withdrawn.editable === false,
    withdrawn,
  );
  const afterWithdraw = s.cli(['bot-grant', ownBot, 'manage-app', 'off'], {
    ...member,
    allowFail: true,
  });
  check(
    'Without authorization the member cannot switch it off or on',
    afterWithdraw.error?.code === 'permission-required',
    afterWithdraw.error?.code,
  );
  s.cli(['roles', 'delete', steward.roleId], { allowFail: true });
}
