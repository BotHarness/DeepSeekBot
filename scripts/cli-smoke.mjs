import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const executable = fileURLToPath(
  new URL('../packages/deepseekbot/dist/deepseekbot.mjs', import.meta.url),
);

export function runCliSmoke({
  env = process.env,
  preset,
  provider,
  model,
  zip,
  git,
  timeout = '120',
  cleanup = false,
  onProgress = () => {},
} = {}) {
  const owned = { bots: [], presets: [] };
  const completed = [];
  const deleted = [];
  const command = (args, stdin) => {
    const run = spawnSync(
      process.execPath,
      [executable, ...args, '--compact', '--timeout', timeout],
      {
        env,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: Math.ceil(Number(timeout) * 1000) + 5000,
        input: stdin,
      },
    );
    let result;
    try {
      result = JSON.parse(run.stdout);
    } catch {
      throw new Error('CLI returned no JSON result.');
    }
    if (run.status !== 0) {
      if (result.bot?.id && !owned.bots.includes(result.bot.id)) owned.bots.push(result.bot.id);
      const error = new Error(`CLI ${args[0]} failed: ${result.error?.code ?? 'unknown'}`);
      error.result = result;
      throw error;
    }
    return result;
  };
  try {
    if (!env.DEEPSEEKBOT_HOST?.trim())
      throw new Error('Set DEEPSEEKBOT_HOST to a disposable running Host before smoke testing.');
    if (!env.DEEPSEEKBOT_HOST_TOKEN?.trim())
      throw new Error('Set DEEPSEEKBOT_HOST_TOKEN before smoke testing.');
    if (!preset) {
      if (!provider || !model)
        throw new Error('Specify an existing preset, or provider and model.');
      const created = command([
        'model-preset-create',
        '--name',
        `CLI smoke ${randomUUID()}`,
        '--orchestrator-provider',
        provider,
        '--orchestrator-model',
        model,
        '--assignment-provider',
        provider,
        '--assignment-model',
        model,
      ]);
      preset = created.preset.id;
      owned.presets.push(preset);
    }
    for (const source of [
      {
        kind: 'blank',
        args: [
          '--persona',
          'For CLI QA, reply to each Human DM with a short response using channel_send.',
        ],
      },
      ...(zip ? [{ kind: 'zip', args: ['--from-zip', zip] }] : []),
      ...(git ? [{ kind: 'git', args: ['--from-git', git] }] : []),
    ]) {
      const created = command([
        'create',
        '--name',
        `CLI ${source.kind} ${randomUUID()}`,
        ...source.args,
        '--preset',
        preset,
      ]);
      owned.bots.push(created.bot.id);
      const plan = command(['model-plan', created.bot.id]);
      if (!plan.plan) throw new Error('No applied Model Plan.');
      const messageId = `human-${randomUUID()}`;
      const reply = command([
        'send',
        created.bot.id,
        '--message-id',
        messageId,
        '--body',
        `[CLI smoke ${messageId}] Please reply briefly using channel_send.`,
      ]);
      if (
        reply.receipt?.messageId !== messageId ||
        reply.state !== 'handled' ||
        !reply.replies?.length
      )
        throw new Error('Missing exact correlated committed reply.');
      const history = command(['channel-messages', created.dm.channelId, '--limit', '20']);
      if (!history.messages.some((item) => item.id === messageId))
        throw new Error('Request missing from committed Channel history.');
      command(['bot-attention', created.bot.id, '--limit', '10']);
      const sessions = command(['bot-sessions', created.bot.id, '--limit', '10']);
      const activity = command(['bot-activity', created.bot.id]);
      const channels = command(['channels']);
      if (!channels.channels.some((item) => item.id === created.dm.channelId))
        throw new Error('DM missing from online Channel discovery.');
      completed.push({
        source: source.kind,
        botId: created.bot.id,
        channelId: created.dm.channelId,
        messageId,
        replyCount: reply.replies.length,
        sessionCount: sessions.total,
        activity: activity.bot?.state,
      });
      onProgress({ source: source.kind, replyCount: reply.replies.length });
    }
    if (cleanup) {
      for (const botId of owned.bots) {
        const preview = command(['bot-delete-preview', botId]);
        const result = command(
          ['bot-delete-confirm', botId, '--confirmation-stdin', '--confirm'],
          JSON.stringify({ token: preview.preview.token }),
        );
        if (result.deletion?.phase !== 'complete' || result.deletion?.memory !== 'retained')
          throw new Error(`Owned Bot cleanup incomplete: ${botId}`);
        deleted.push(botId);
      }
    }
    return {
      ok: true,
      completed,
      owned,
      cleanup: {
        deleted,
        memory: 'retained',
        note: cleanup
          ? 'Deleted only this run’s owned Bot identities; Memory and any created preset remain available.'
          : 'Retained for inspection. Use --cleanup to delete only this run’s Bot identities through the owner; Memory is retained.',
      },
    };
  } catch (error) {
    return {
      ok: false,
      completed,
      owned,
      error: {
        message: error instanceof Error ? error.message : 'Smoke failed',
        ...(error.result === undefined ? {} : { result: error.result }),
      },
      cleanup: {
        deleted,
        memory: 'retained',
        note: 'Remaining resources retained for diagnosis; only the IDs in owned belong to this smoke run.',
      },
    };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      preset: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      zip: { type: 'string' },
      git: { type: 'string' },
      timeout: { type: 'string' },
      cleanup: { type: 'boolean' },
    },
    strict: true,
  });
  const result = runCliSmoke(values);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
