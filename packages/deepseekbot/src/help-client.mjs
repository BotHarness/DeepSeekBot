import { parseArgs } from 'node:util';

export async function runHelpClient(args, output = (text) => process.stdout.write(text + '\n')) {
  let socket;
  try {
    const { values } = parseArgs({
      args,
      options: {
        cdp: { type: 'string' },
        target: { type: 'string' },
        action: { type: 'string', default: 'content' },
        question: { type: 'string' },
        'guide-target': { type: 'string' },
        query: { type: 'string', default: '' },
      },
      strict: true,
    });
    if (!values.cdp || !values.target) throw new Error('help_client_required');
    const base = new URL(values.cdp);
    if (
      base.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
      base.username ||
      base.password ||
      base.search ||
      base.pathname !== '/'
    )
      throw new Error('help_client_local_only');
    if (!['content', 'availability', 'state', 'start', 'cancel', 'show'].includes(values.action))
      throw new Error('help_invalid_action');
    if (['availability', 'start', 'show'].includes(values.action) && !values.question)
      throw new Error('help_question_required');
    const targets = await (
      await fetch(new URL('/json/list', base), { signal: AbortSignal.timeout(5000) })
    ).json();
    const target = targets.find((item) => item.id === values.target && item.type === 'page');
    if (!target?.webSocketDebuggerUrl) throw new Error('help_client_not_found');
    const address = new URL(target.webSocketDebuggerUrl);
    if (
      address.protocol !== 'ws:' ||
      address.hostname !== base.hostname ||
      address.port !== base.port
    )
      throw new Error('help_client_endpoint_mismatch');
    socket = new WebSocket(address);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('help_client_timeout')), 5000);
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('help_client_unreachable'));
        },
        { once: true },
      );
    });
    const expression = `(async () => {
      const help = window[Symbol.for('botharness.clientHelp')];
      if (!help) throw new Error('help_client_unavailable');
      const input = ${JSON.stringify(values)};
      if (input.action === 'show') { help.show(input.question); return help.selection(); }
      if (input.action === 'state') return help.state();
      if (input.action === 'cancel') { help.cancel('agent-cancelled'); return help.state(); }
      if (input.action === 'availability') return help.availability(input.question);
      if (input.action === 'start') { await help.start(input.question,input['guide-target']); return help.state(); }
      return { topics: help.topics().map(t => ({id:t.id,title:t.title,overview:t.overview,panelId:t.panelId,questions:t.questions.map(q=>q.id)})), questions: help.search(input.query).map(q=>({id:q.id,title:q.title,answer:q.answer,hasGuide:!!q.guide,hasAskTob:!!q.askTob})) };
    })()`;
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('help_client_timeout')), 15000);
      socket.addEventListener('message', (event) => {
        const response = JSON.parse(event.data);
        if (response.id !== 1) return;
        clearTimeout(timeout);
        if (response.error || response.result?.exceptionDetails)
          reject(new Error('help_client_refused'));
        else resolve(response.result.result.value);
      });
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
    output(JSON.stringify({ ok: true, result }));
    return 0;
  } catch (error) {
    const code =
      error instanceof Error && /^help_[a-z_]+$/.test(error.message)
        ? error.message
        : 'help_client_failed';
    output(JSON.stringify({ ok: false, error: { code } }));
    return 1;
  } finally {
    socket?.close();
  }
}
