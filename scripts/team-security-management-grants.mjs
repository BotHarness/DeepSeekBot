export async function managementGrantCases(define, s, fx) {
  await define(
    'C8',
    'Management grants support several holders and live revocation',
    async (check) => {
      const tob = s.cli(['tob-home']).botSlug;
      const target = fx.vaultSlug;
      const set = (bot, capability, state, options) =>
        s.cli(['bot-grant', bot, capability, state], options);
      const denied = set(target, 'manage-app', 'on', { as: fx.users.bob, allowFail: true });
      check(
        'Member cannot grant management authority',
        ['permission-required', 'remote-access/denied'].includes(denied.error?.code),
        denied.error?.code,
      );
      check(
        'Built-in Tob starts with both grants',
        set(tob, 'manage-app', 'on').grants?.length === 2,
      );
      check(
        'Another Bot can hold only App management',
        set(target, 'manage-app', 'on').grants?.join() === 'manage-app',
      );
      check(
        'Another Bot can independently hold Bot management',
        set(target, 'manage-bots', 'on').grants?.length === 2,
      );
      const before = s.ask(
        'second-holder',
        undefined,
        target,
        'In this Human DM run deepseekbot capabilities and doctor using native Shell. Reply with the doctor result.',
      );
      const trace = s.cli(['bot-trace', target, '--turns', '2'], { allowFail: true });
      s.transcript('second-holder-cli-trace', trace);
      check(
        'Second holder ran the requested CLI commands in a real model turn',
        Boolean(before.replies) && JSON.stringify(trace).includes('deepseekbot doctor'),
      );

      check(
        'Revocation keeps the other grant',
        set(target, 'manage-app', 'off').grants?.join() === 'manage-bots',
      );
      check('Both grants can be revoked', set(target, 'manage-bots', 'off').grants?.length === 0);
      try {
        set(tob, 'manage-app', 'off');
        set(tob, 'manage-bots', 'off');
        const withoutHolder = s.cli(['tob-cli', 'start', '--args-stdin'], {
          input: JSON.stringify({ argv: ['capabilities'] }),
          allowFail: true,
        });
        check(
          'A Profile with zero holders refuses scoped CLI admission',
          withoutHolder.error?.code === 'tob-authority-required',
          withoutHolder.error?.code,
        );
      } finally {
        set(tob, 'manage-app', 'on');
        set(tob, 'manage-bots', 'on');
      }
      check(
        'Second holder grant changes reached its Human DM',
        s
          .messages(`dm-${target}`)
          .some(
            (message) =>
              message.author?.kind === 'system' && message.body?.includes('can no longer manage'),
          ),
      );
    },
  );
  await define(
    'C9',
    'Destructive scoped CLI writes require fresh Human confirmation',
    async (check) => {
      const tob = s.cli(['tob-home']);
      const target = fx.vaultSlug;
      const preview = s.cli(['bot-delete-preview', target]).preview;
      const request = s.cli(['tob-cli', 'start', '--args-stdin'], {
        input: JSON.stringify({
          argv: ['bot-delete-confirm', target, '--confirmation-stdin', '--confirm'],
          stdin: JSON.stringify({ token: preview.token }),
        }),
      });
      const until = Date.now() + 30_000;
      let pending;
      while (Date.now() < until && !pending) {
        pending = s
          .messages(tob.channelId)
          .find(
            (message) =>
              message.toolApprovalRequest?.toolName === 'deepseekbot bot-delete-confirm' &&
              !message.toolApprovalResult,
          );
        if (!pending) await new Promise((done) => setTimeout(done, 250));
      }
      check('Deletion waits in the Human DM', Boolean(pending), pending?.toolApprovalRequest);
      s.cli(['tob-cli', 'cancel', request.id], { allowFail: true });
      check(
        'Cancelling the request preserves the Bot',
        s.cli(['show', target]).bot?.slug === target,
      );
    },
  );
}
