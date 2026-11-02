import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';

const { values } = parseArgs({
  options: {
    launch: { type: 'string' },
    bot: { type: 'string' },
    rounds: { type: 'string', default: '6' },
    'interval-seconds': { type: 'string', default: '30' },
    output: { type: 'string' },
  },
});
const rounds = Number(values.rounds);
const interval = Number(values['interval-seconds']);
if (
  !values.launch ||
  !values.bot ||
  !Number.isSafeInteger(rounds) ||
  rounds < 1 ||
  rounds > 60 ||
  !Number.isFinite(interval) ||
  interval < 0 ||
  interval > 60
)
  throw new Error(
    'Use --launch <private-launch.json> --bot <QA-bot-id> [--rounds 1..60] [--interval-seconds 0..60] [--output <report.json>].',
  );
const launch = JSON.parse(readFileSync(values.launch, 'utf8'));
const login = new URL(launch.url);
const token = login.searchParams.get('token');
if (!token) throw new Error('The private launch file has no Host token.');
const cli = resolve('packages/deepseekbot/dist/deepseekbot.mjs');
const run = promisify(execFile);
const env = { ...process.env, DEEPSEEKBOT_HOST: login.origin, DEEPSEEKBOT_HOST_TOKEN: token };
const report = { startedAt: new Date().toISOString(), rounds: [], finishedAt: undefined };
async function invoke(args) {
  const result = await run(process.execPath, [cli, ...args, '--compact'], {
    env,
    windowsHide: true,
    timeout: 70000,
  });
  if (result.stdout.includes(token) || result.stderr.includes(token))
    throw new Error('Authentication appeared in CLI output.');
  if (result.stdout.trim().split('\n').length !== 1)
    throw new Error('CLI output was not one compact JSON document.');
  return JSON.parse(result.stdout);
}
try {
  for (let index = 0; index < rounds; index += 1) {
    const marker = `CLI_SOAK_${randomUUID().replaceAll('-', '')}`;
    const messageId = `human-${randomUUID()}`;
    const started = Date.now();
    const sent = await invoke([
      'send',
      values.bot,
      '--body',
      `Reply through bot_send_message with exactly ${marker}.`,
      '--message-id',
      messageId,
      '--timeout',
      '60',
    ]);
    if (!sent.replies.some((reply) => reply.body === marker))
      throw new Error('The exact requested reply was not committed.');
    const resumed = await invoke(['send-status', values.bot, '--message-id', messageId]);
    if (
      resumed.sourceEventId !== sent.sourceEventId ||
      !resumed.replies.some((reply) => reply.body === marker)
    )
      throw new Error('Receipt correlation changed on the second invocation.');
    const entry = {
      round: index + 1,
      durationMs: Date.now() - started,
      requestId: messageId,
      sourceEventId: sent.sourceEventId,
      replyIds: sent.replies.map((reply) => reply.id),
      resumed: true,
    };
    report.rounds.push(entry);
    console.log(JSON.stringify(entry));
    if (index + 1 < rounds) await delay(interval * 1000);
  }
  report.finishedAt = new Date().toISOString();
} catch (error) {
  let code = 'probe-failed';
  try {
    const parsed = JSON.parse(error.stdout);
    if (/^[a-z][a-z0-9/-]*$/u.test(parsed.error?.code)) code = parsed.error.code;
  } catch {}
  report.failure = { code };
  process.exitCode = 1;
  console.error(
    `Live CLI soak failed (${code}); inspect the private Host logs and completed rounds in the report.`,
  );
} finally {
  if (values.output) writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n');
}
