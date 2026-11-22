import { rpc } from './verify-app.mjs';

export async function runHostSessionGate(s, fx, check) {
  const instance = { home: s.home, url: s.url.href };
  const { sessionId } = await rpc(instance, 'session/create', {
    request: { cwd: fx.sharedFinance },
  });
  const member = { as: fx.users.bob, allowFail: true };
  s.ask(
    'member-root',
    fx.users.bob,
    fx.bots.bob,
    'Reply with exactly: Ready for the Session check.',
  );
  const ownerList = s.cli(['session-list']);
  const memberList = s.cli(['session-list'], member);
  check(
    'Owner inventory includes the native root',
    ownerList.sessions?.some((row) => row.sessionId === sessionId && row.source.kind === 'native'),
  );
  check(
    'Member inventory contains only roots of the member’s Bot',
    Array.isArray(memberList.sessions) &&
      memberList.sessions.length > 0 &&
      memberList.sessions.every(
        (row) => row.source.kind === 'bot' && row.source.botSlug === fx.bots.bob,
      ),
    { rows: memberList.sessions?.length },
  );
  for (const args of [
    ['session-transcript', '--session', sessionId],
    ['session-live', '--session', sessionId],
    ['session-model', '--session', sessionId],
    ['session-send', sessionId, 'M15 member prompt'],
  ]) {
    const result = s.cli(args, member);
    check(
      `Member ${args[0]} refused`,
      result.error?.code === 'permission-required',
      result.error?.code,
    );
  }
  const accepted = s.cli(['session-send', sessionId, 'Reply with exactly M15-4932-OK.']);
  check('Owner prompt admitted', typeof accepted.requestId === 'string');
  const transcript = s.cli(['session-transcript', '--session', sessionId]);
  check('Owner can read the native transcript', transcript.role === 'native');
}
