import { rpc } from './verify-app.mjs';

export async function runHostSessionGate(s, fx, check) {
  const instance = { home: s.home, url: s.url.href };
  const { sessionId } = await rpc(instance, 'session/create', {
    request: { cwd: fx.sharedFinance },
  });
  const member = { as: fx.users.bob, allowFail: true };
  const humanMarker = 'C6-phone-session-human';
  const nativeMarker = 'C6-phone-session-native';
  const hiddenMarker = 'C6-phone-session-hidden';
  await rpc(instance, 'session/rename', { request: { sessionId, title: nativeMarker } });
  const { replies } = s.ask(
    'member-root',
    fx.users.bob,
    fx.bots.bob,
    `${humanMarker}\nReply with exactly the reverse of the eight-letter word "wonderss".`,
  );
  s.ask('other-member-root', fx.users.alice, fx.bots.alice, `${hiddenMarker}\nReply with only OK.`);
  const ownerList = s.cli(['session-list']);
  const memberList = s.cli(['session-list'], member);
  check(
    'Owner inventory includes the native root',
    ownerList.sessions?.some((row) => row.sessionId === sessionId && row.source.kind === 'native'),
  );
  const memberRoot = memberList.sessions?.find((row) => row.source.botSlug === fx.bots.bob);
  if (memberRoot !== undefined) {
    await rpc(instance, 'session/rename', {
      request: { sessionId: memberRoot.sessionId, title: 'C6 member Session' },
    });
  }
  const memberSearch = s.cli(
    [
      'session-list',
      '--search',
      humanMarker,
      '--source',
      `bot:${fx.bots.bob}`,
      '--sort',
      'created',
    ],
    member,
  );
  check(
    'Member search finds the Human prompt in their Bot Session',
    memberSearch.sessions?.some(
      (row) => row.source.kind === 'bot' && row.source.botSlug === fx.bots.bob,
    ),
  );
  const ownerNative = s.cli([
    'session-list',
    '--search',
    nativeMarker,
    '--source',
    'native',
    '--sort',
    'last-activity',
  ]);
  check(
    'Owner can search native titles while filtering by source',
    ownerNative.sessions?.length === 1 && ownerNative.sessions[0]?.sessionId === sessionId,
  );
  const ownerHidden = s.cli(['session-list', '--search', hiddenMarker]);
  check(
    'Owner search sees the other Bot Session',
    ownerHidden.sessions?.some((row) => row.source.botSlug === fx.bots.alice),
  );
  for (const [label, marker] of [
    ['native', nativeMarker],
    ['another Bot', hiddenMarker],
  ]) {
    const result = s.cli(['session-list', '--search', marker], member);
    check(`Member search hides ${label} Sessions`, result.sessions?.length === 0);
  }
  check('Model reply marker exists', replies.toLowerCase().includes('ssrednow'));
  const modelOnly = s.cli(['session-list', '--search', 'ssrednow'], member);
  check('A model reply alone does not match Session search', modelOnly.sessions?.length === 0);
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
