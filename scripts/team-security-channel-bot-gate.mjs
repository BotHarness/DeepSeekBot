import { randomUUID } from 'node:crypto';

export async function runChannelBotGate(s, fx, tag, check) {
  const create = (name) => {
    const result = s.cli([
      'group-create',
      name,
      '--member',
      fx.ledgerSlug,
      '--operation-key',
      randomUUID(),
    ]);
    const id = result.channel?.id ?? result.channelId ?? result.id;
    for (const human of [fx.humans.bob, fx.humans.carol])
      s.cli(['channels', 'add-member', id, human.humanId]);
    return id;
  };
  const a = create(`Studio A ${tag}`);
  const b = create(`Studio B ${tag}`);
  const update = (id, as, ...args) =>
    s.cli(['channels', 'bots', id, fx.ledgerSlug, ...args], { as });
  const send = (id, as, body, mention = true) =>
    s.cli(
      [
        'channels',
        'send',
        id,
        '--body-stdin',
        ...(mention ? ['--mention-bot', fx.ledgerSlug, '--mention-label', `Ledger ${tag}`] : []),
      ],
      { as, input: body },
    ).message.id;
  const delivered = (channelId, as, messageId) =>
    s.messages(channelId, as).find((message) => message.id === messageId);
  const denied = (channelId, as, messageId, mention = true) => {
    const message = delivered(channelId, as, messageId);
    return (
      !!message &&
      (message.mentions?.some((item) => item.botSlug === fx.ledgerSlug) ?? false) === mention &&
      !message.deliveries?.some((delivery) => delivery.botSlug === fx.ledgerSlug)
    );
  };
  const handled = async (channelId, as, messageId) => {
    const deadline = Date.now() + s.options.timeout * 1000;
    while (Date.now() < deadline) {
      if (
        delivered(channelId, as, messageId)?.deliveries?.some(
          (delivery) => delivery.botSlug === fx.ledgerSlug && delivery.state === 'handled',
        )
      )
        return true;
      await new Promise((done) => setTimeout(done, 2000));
    }
    return false;
  };
  const ask = 'Reply in this Channel with Studio ready.';
  s.cli(['channels', 'admins', a, '--set', fx.humans.carol.humanId]);
  update(a, fx.users.carol, '--audience', 'admins');
  const view = s.cli(['channels', 'bots', a], { as: fx.users.carol });
  check(
    'channel admin can configure and read the Bot audience with --as',
    view.bots.some((bot) => bot.botSlug === fx.ledgerSlug && bot.audience.kind === 'admins'),
  );
  const member = send(a, fx.users.bob, ask);
  const admin = send(a, fx.users.carol, ask);
  check('channel admin @ starts and completes a Turn', await handled(a, fx.users.carol, admin));
  check('ordinary member @ is visible with no Turn', denied(a, fx.users.bob, member));
  const channel = s.cli(['channel', a]);
  s.cli([
    'group-wake-set',
    a,
    '--bot',
    fx.ledgerSlug,
    '--mode',
    'all',
    '--expected-channel',
    channel.channelFingerprint ?? channel.channel?.channelFingerprint,
  ]);
  const plainMember = send(a, fx.users.bob, ask, false);
  const plainAdmin = send(a, fx.users.carol, ask, false);
  check(
    'channel admin plain message completes a Turn in all mode',
    await handled(a, fx.users.carol, plainAdmin),
  );
  check(
    'plain member message with an admins-only Bot stays visible without admission',
    denied(a, fx.users.bob, plainMember, false),
  );
  update(a, fx.users.carol, '--audience', 'everyone');
  const { policy } = s.cli(['channels', 'policy', a]);
  const setPolicy = (value) =>
    s.cli(['channels', 'policy', a, '--policy-stdin'], { input: JSON.stringify(value) });
  setPolicy({ ...policy, overrides: [{ roleId: 'member', actions: { wakeBot: 'deny' } }] });
  const roleDenied = send(a, fx.users.bob, ask, false);
  check(
    'plain message from a role denied wakeBot stays visible without admission',
    denied(a, fx.users.bob, roleDenied, false),
  );
  setPolicy(policy);
  update(a, fx.users.carol, '--block-human', fx.humans.bob.humanId);
  const blocked = send(a, fx.users.bob, ask);
  const permitted = send(b, fx.users.bob, ask);
  check('same member @ in channel B completes a Turn', await handled(b, fx.users.bob, permitted));
  check('blocked member @ in channel A is visible with no Turn', denied(a, fx.users.bob, blocked));
}
