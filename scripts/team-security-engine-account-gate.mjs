export function runEngineAccountGrantGate(s, fx, check) {
  const as = fx.users.bob;
  const roleId = fx.roles.creators.roleId;
  const account = 'codex-default';
  const use = (bot, engine, id) =>
    s.cli(
      [
        'engine',
        'use',
        bot,
        engine,
        '--role',
        'orchestrator',
        ...(id === undefined ? [] : ['--account', id]),
      ],
      { as, allowFail: true },
    );
  const grant = (id) =>
    s.cli(['roles', 'update', roleId, '--models', 'all', '--engine-accounts', id]);
  try {
    const denied = use(fx.bots.bob, 'codex', account);
    check(
      'all API models do not grant a subscription',
      denied?.error?.code === 'model-not-allowed',
      denied,
    );
    grant(account);
    const allowed = s.cli(['models', 'allowed'], { as });
    check(
      'role grants the exact account id',
      allowed.all === true && allowed.engineAccounts?.join(',') === account,
      allowed,
    );
    const other = use(fx.bots.bob, 'claude', 'claude');
    check(
      'another subscription remains refused',
      other?.error?.code === 'model-not-allowed',
      other,
    );
    const foreign = use(fx.bots.alice, 'codex', account);
    check(
      'a grant does not authorize editing a different member’s Bot',
      foreign?.error?.code === 'bot-not-found',
      foreign,
    );
    const saved = use(fx.bots.bob, 'codex', account);
    check(
      'granted Bot can save the account selection without signing in',
      saved?.accountId === account && saved?.bot === fx.bots.bob,
      saved,
    );
    grant('');
    const revoked = use(fx.bots.bob, 'codex', account);
    check(
      'grant revocation refuses another write',
      revoked?.error?.code === 'model-not-allowed',
      revoked,
    );
  } finally {
    use(fx.bots.bob, 'none');
    grant('');
  }
}
