export async function runStewardGate(s, { as, target }, check) {
  const member = { as };
  const previous = s.cli(['steward']).botSlug;
  const privateHome = s.cli(['tob-home'], member);
  const memberId = s.cli(['steward'], member);
  check(
    'Member receives only the Steward Bot id',
    Object.keys(memberId).join(',') === 'botSlug' && memberId.botSlug === previous,
    memberId,
  );
  check(
    'Member receives no Steward Home or Workspace data',
    Object.keys(privateHome).join(',') === 'available' && privateHome.available === false,
  );
  const denied = s.cli(['steward-transfer', target, '--confirm'], {
    ...member,
    allowFail: true,
  });
  check(
    'Member remote policy excludes Steward transfer',
    denied.error?.code === 'remote-access/denied',
    denied.error?.code,
  );
  check('Member denial preserves the Steward', s.cli(['steward']).botSlug === previous);

  const transferred = s.cli(['steward-transfer', target, '--confirm']);
  check('Owner moves the role', transferred.botSlug === target);
  const from = s.messages(`dm-${previous}`);
  const to = s.messages(`dm-${target}`);
  check(
    'Both Human DMs contain the same Host system marker',
    [from, to].every((messages) =>
      messages.some(
        (message) =>
          message.author?.kind === 'system' && message.stewardTransfer?.botSlug === target,
      ),
    ),
  );
  const approvals = s
    .messages(`dm-${target}`)
    .filter((message) => message.toolApprovalRequest).length;
  let request = s.cli(['tob-cli', 'start', '--args-stdin'], {
    input: JSON.stringify({ argv: ['steward-transfer', previous, '--confirm'] }),
  });
  const until = Date.now() + 30_000;
  while (request.state === 'running' && Date.now() < until) {
    await new Promise((done) => setTimeout(done, 250));
    request = s.cli(['tob-cli', 'status', request.id]);
  }
  s.transcript('steward-cli-refusal', request);
  let refusal = request.code;
  try {
    refusal ??= JSON.parse(request.result?.stdout ?? '').error?.code;
  } catch {}
  check('Steward broker refuses transfer', refusal === 'cli-command-refused', refusal);
  check(
    'Steward refusal creates no approval card or transfer',
    s.messages(`dm-${target}`).filter((message) => message.toolApprovalRequest).length ===
      approvals && s.cli(['steward']).botSlug === target,
  );
}
