#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rpc as verifyRpc, verifyPaths } from './verify-app.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const usage = `Usage: node scripts/e2e-tob-delegation.mjs [options]

Tob Delegation against a real model on an isolated DSH Host (issue #3086). The Human asks Tob in
its Human DM; the script asserts on canonical Channel state and Tob's tool trace, not on wording.

Cases:
  fit    A seeded colleague whose description fits receives exactly one Bot-to-Bot DM message
         from Tob without a Human question first, the action notice appears in the Tob DM, the
         colleague replies, and Tob reports the colleague's answer in its Human DM.
  none   No colleague fits: Tob sends nothing to any Bot, creates no Bot, and answers the Human
         in its DM offering to create one.

Options:
  --name <n>      verify-app instance to use (default tob-delegation).
  --launch        Launch that instance first (after pnpm build) and stop it afterwards.
  --case <id>     fit or none (repeatable). Default: both, in that order.
  --timeout <s>   Seconds to wait for each case (default 300).

Both Tob and the colleagues run on the newest DeepSeek model in the Host catalog (the highest
DeepSeek version among deepseek-official entries), so the Host needs DEEPSEEK_API_KEY or a
profile credential. Evidence is written under .humanlayer/verify/<name>/evidence/delegation-<time>/.`;

function parseArgs(argv) {
  const options = { name: 'tob-delegation', launch: false, cases: [], timeoutSeconds: 300 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--name') options.name = value();
    else if (arg === '--launch') options.launch = true;
    else if (arg === '--case') {
      const id = value();
      if (!['fit', 'none'].includes(id)) throw new Error(`unknown case ${id}`);
      options.cases.push(id);
    } else if (arg === '--timeout') {
      options.timeoutSeconds = Number(value());
      if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds < 30)
        throw new Error('--timeout must be at least 30 seconds');
    } else throw new Error(`unknown option ${arg}`);
  }
  if (options.cases.length === 0) options.cases = ['fit', 'none'];
  return options;
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

function verifyApp(args) {
  const result = spawnSync(process.execPath, ['scripts/verify-app.mjs', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 900_000,
  });
  if (result.status !== 0) throw new Error(`verify-app ${args[0]} failed`);
  return JSON.parse(result.stdout);
}

export function newestDeepSeekRoute(models) {
  const version = (entry) =>
    (/V(\d+(?:\.\d+)*)/iu.exec(entry.modelName ?? entry.model)?.[1] ?? '0').split('.').map(Number);
  const newer = (a, b) => {
    const [x, y] = [version(a), version(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i += 1)
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
    return false;
  };
  const official = models.filter((entry) => entry.provider === 'deepseek-official');
  if (official.length === 0) throw new Error('the Host catalog has no deepseek-official model');
  const best = official.reduce((a, b) => (newer(b, a) ? b : a));
  return { provider: best.provider, model: best.model, modelName: best.modelName };
}

function botDmBetween(channels, a, b) {
  return channels.filter(
    (channel) =>
      channel.id.startsWith('dm-bots-') &&
      (channel.members ?? []).length === 2 &&
      channel.members.includes(a) &&
      channel.members.includes(b),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }
  const paths = verifyPaths(options.name);
  let launched = false;
  if (options.launch) {
    verifyApp(['launch', '--name', options.name]);
    launched = true;
  }
  const out = join(paths.evidence, `delegation-${Date.now()}`);
  mkdirSync(out, { recursive: true });
  const save = (name, value) =>
    writeFileSync(join(out, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  const results = [];
  try {
    if (!existsSync(paths.instance))
      throw new Error(`no instance at ${paths.instance}; pass --launch or run verify-app launch`);
    const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
    const call = (method, args = {}) => verifyRpc(instance, `botharness/${method}`, args);
    const messages = async (channelId) =>
      (await call('channelMessages', { channelId, limit: 100 })).messages;
    const calls = async (slug) =>
      (await call('botToolTrace', { slug, turns: 20 }).catch(() => ({ turns: [] }))).turns.flatMap(
        (turn) => turn.calls,
      );

    const { models } = await call('modelCatalog');
    const route = newestDeepSeekRoute(models);
    const { preset } = await call('modelPresetCreate', {
      name: `Tob Delegation e2e ${Date.now()}`,
      orchestrator: { provider: route.provider, model: route.model },
      assignmentDefault: { provider: route.provider, model: route.model },
    });
    const tob = await call('tobHome');
    await call('modelPresetApply', { slug: tob.botSlug, presetId: preset.id });

    const suffix = Date.now().toString(36);
    const seed = async (displayName, description, persona, coreMemory) => {
      const created = await call('create', { displayName, description, persona, coreMemory });
      const slug = created.bot.slug;
      await call('channelDm', { slug, displayName });
      await call('modelPresetApply', { slug, presetId: preset.id });
      return { slug, displayName };
    };
    const keeper = await seed(
      `仓库管理员 Stock-${suffix}`,
      'Keeps the team warehouse inventory records and answers stock-level questions about items in the warehouse.',
      '你是仓库管理员 Stock。别的 Bot 在 Bot-to-Bot DM 里问你库存时，用 bot_send_message 在同一个 DM 里用一句话回答具体数量。',
      '# 仓库库存\n\n- 蓝色马克杯：37 件\n- 红色雨伞：12 件\n',
    );
    const poet = await seed(
      `诗人 Lyra-${suffix}`,
      'Writes short poems and haiku on request.',
      '你是诗人 Lyra，只负责写短诗。',
      '# 记忆\n\n暂无。\n',
    );
    save('setup', { route, presetId: preset.id, tob, keeper, poet });
    console.log(JSON.stringify({ step: 'setup', route, tob: tob.botSlug, keeper, poet }));

    const sendToTob = async (body) => {
      const before = new Set((await messages(tob.channelId)).map((message) => message.id));
      const beforeCalls = new Set((await calls(tob.botSlug)).map((entry) => entry.callId));
      const beforeChannels = (await call('channels')).channels;
      const beforeBots = new Set(
        beforeChannels.filter((c) => c.id.startsWith('dm-bots-')).map((c) => c.id),
      );
      await call('channelSend', { channelId: tob.channelId, body });
      return { body, before, beforeCalls, beforeBots, started: Date.now() };
    };
    const freshTobMessages = async (context) =>
      (await messages(tob.channelId)).filter((message) => !context.before.has(message.id));
    const assertNoFailure = (list) => {
      const failed = list.find((message) => message.sessionFailure);
      if (failed) throw new Error(`Session failed: ${JSON.stringify(failed.sessionFailure)}`);
    };
    const tobBotDmSends = async (context) => {
      const { channels } = await call('channels');
      const sends = [];
      for (const channel of channels.filter(
        (c) => c.id.startsWith('dm-bots-') && (c.members ?? []).includes(tob.botSlug),
      )) {
        for (const message of await messages(channel.id))
          if (
            message.author?.kind === 'bot' &&
            message.author.slug === tob.botSlug &&
            Date.parse(message.at) >= context.started - 1000
          )
            sends.push({ channelId: channel.id, members: channel.members, message });
      }
      return sends;
    };

    for (const id of options.cases) {
      const deadline = () => Date.now() + options.timeoutSeconds * 1000;
      if (id === 'fit') {
        const context = await sendToTob(
          '仓库里现在还有多少个蓝色马克杯？请交给负责的同事去查，再把结果告诉我。',
        );
        let report;
        const until = deadline();
        while (Date.now() < until) {
          const fresh = await freshTobMessages(context);
          assertNoFailure(fresh);
          const action = fresh.find((message) => message.botDmAction);
          report = fresh.find(
            (message) =>
              message.author?.kind === 'bot' &&
              !message.botDmAction &&
              !message.botChannelPost &&
              /37/u.test(message.body ?? '') &&
              (action === undefined || Date.parse(message.at) >= Date.parse(action.at)),
          );
          if (action && report) break;
          report = undefined;
          await delay(3000);
        }
        const fresh = await freshTobMessages(context);
        const sends = await tobBotDmSends(context);
        const trace = (await calls(tob.botSlug)).filter(
          (entry) => !context.beforeCalls.has(entry.callId),
        );
        const { channels } = await call('channels');
        const keeperDm = botDmBetween(channels, tob.botSlug, keeper.slug);
        const keeperMessages = keeperDm.length ? await messages(keeperDm[0].id) : [];
        save('fit', { tobMessages: fresh, sends, trace, keeperDm, keeperMessages });
        assert.ok(report, 'Tob did not report the colleague result (37) in its Human DM');
        assert.ok(
          trace.some((entry) => entry.name === 'list_bot_contacts'),
          'Tob did not look up colleagues with list_bot_contacts',
        );
        assert.equal(sends.length, 1, 'Tob must send exactly one Bot-to-Bot DM message');
        assert.ok(sends[0].members.includes(keeper.slug), 'Tob delegated to the wrong colleague');
        assert.equal(keeperDm.length, 1, 'expected one Bot-to-Bot DM with the colleague');
        const action = fresh.find(
          (message) =>
            message.botDmAction?.recipientBotSlug === keeper.slug &&
            message.botDmAction.messageId === sends[0].message.id,
        );
        assert.ok(action, 'no action notice for the send in the Tob Human DM');
        const firstSend = Date.parse(sends[0].message.at);
        assert.ok(
          !fresh.some(
            (message) => message.userQuestionRequest && Date.parse(message.at) <= firstSend,
          ),
          'Tob asked the Human before delegating',
        );
        const reply = keeperMessages.find(
          (message) => message.author?.kind === 'bot' && message.author.slug === keeper.slug,
        );
        assert.ok(reply, 'the colleague did not reply in the Bot-to-Bot DM');
        assert.ok(Date.parse(report.at) >= Date.parse(reply.at), 'Tob reported before the reply');
        assert.ok(
          !botDmBetween(channels, tob.botSlug, poet.slug).length,
          'Tob contacted the unrelated colleague',
        );
        results.push({
          case: 'fit',
          result: 'pass',
          send: sends[0].message.body,
          reply: reply.body,
          report: report.body,
        });
      } else {
        const botsBefore = (await call('list')).bots?.length;
        const context = await sendToTob(
          '我需要一位懂税务的同事帮我核对今年的个人所得税专项附加扣除，请交给合适的同事处理。',
        );
        let reply;
        const until = deadline();
        while (Date.now() < until) {
          const fresh = await freshTobMessages(context);
          assertNoFailure(fresh);
          reply = fresh.find(
            (message) =>
              message.author?.kind === 'bot' &&
              !message.botDmAction &&
              !message.botChannelPost &&
              (message.body ?? '').trim().length > 0,
          );
          if (reply) break;
          await delay(3000);
        }
        await delay(20_000);
        const fresh = await freshTobMessages(context);
        const sends = await tobBotDmSends(context);
        const trace = (await calls(tob.botSlug)).filter(
          (entry) => !context.beforeCalls.has(entry.callId),
        );
        const botsAfter = (await call('list')).bots?.length;
        save('none', { tobMessages: fresh, sends, trace, botsBefore, botsAfter });
        assert.ok(reply, 'Tob did not answer the Human in its DM');
        assert.equal(sends.length, 0, 'Tob sent to a Bot although no colleague fits');
        assert.ok(
          !fresh.some((message) => message.botDmAction),
          'unexpected action notice in the Tob DM',
        );
        assert.equal(botsAfter, botsBefore, 'Tob created a Bot without the Human agreeing');
        const said = fresh
          .filter((message) => message.author?.kind === 'bot')
          .map((message) => message.body ?? '')
          .join('\n');
        assert.match(said, /创建|新建|create/iu, 'Tob did not offer to create a suitable Bot');
        results.push({ case: 'none', result: 'pass', reply: said });
      }
      console.log(JSON.stringify(results.at(-1)));
    }
    save('result', { result: 'pass', route, results });
    console.log(JSON.stringify({ result: 'pass', model: route.modelName, evidence: out }));
  } catch (error) {
    save('result', { result: 'fail', error: String(error?.message ?? error), results });
    console.error(
      JSON.stringify({ result: 'fail', error: String(error?.message ?? error), evidence: out }),
    );
    process.exitCode = 1;
  } finally {
    if (launched) verifyApp(['stop', '--name', options.name]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
