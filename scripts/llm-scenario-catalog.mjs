import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUNTIME_AREAS = [
  'packages/core/src/runtime/',
  'packages/core/src/channels/',
  'packages/core/src/messaging/',
  'packages/core/src/plugin.ts',
  'packages/deepseekbot/',
  'scripts/e2e-llm-scenarios.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'patches/',
];

export const CAST = {
  nexus: {
    displayName: '总控 Nexus',
    persona:
      '你是项目总控 Nexus。你在群里协调各位同事，收到同事汇报后简短确认并决定下一步。需要同事做事时在群里 @ 他。',
  },
  aura: {
    displayName: '美工 Aura',
    persona: '你是美工 Aura，负责视觉设计。任务很小就直接在群里给出结果。',
  },
  atlas: {
    displayName: '叙事 Atlas',
    persona: '你是叙事策划 Atlas，负责故事和文案。任务很小就直接在群里给出结果。',
  },
  vera: {
    displayName: '质检 Vera',
    persona: '你是质检 Vera，负责审核同事的产出并指出需要修改的地方。',
  },
};

const REPORT_RULE = '大家都只在被 @ 时才会被唤醒，所以完成后必须在群消息里 @总控 Nexus 汇报结果。';

export const SCENARIOS = [
  {
    id: 'dm-reply',
    summary: 'A Human DM gets a committed reply through bot_send_message.',
    areas: RUNTIME_AREAS,
    bots: ['aura'],
    async run(ctx) {
      const dm = await ctx.dm('aura');
      await ctx.humanSend(dm, 'What is 6 times 7? Answer with digits only.');
      await ctx.waitFor('Bot reply with 42', () =>
        ctx
          .messages(dm)
          .find(
            (message) =>
              ctx.isBot(message, 'aura') && message.body.trim() === '42' && !message.sessionFailure,
          ),
      );
    },
  },
  {
    id: 'dm-reply-schema-filled',
    summary:
      'A model that fills every optional bot_send_message field with an empty value still gets its DM reply committed on the first call (#3296).',
    areas: RUNTIME_AREAS,
    bots: ['aura'],
    async run(ctx) {
      const dm = await ctx.dm('aura');
      await ctx.humanSend(
        dm,
        [
          'This is a tool-argument compatibility test. Reply with exactly the digits 42 by calling bot_send_message once.',
          'Fill in EVERY parameter of bot_send_message explicitly: source_event_id is this message\'s Source Event ID and body is "42";',
          'every other parameter must still be present with an empty value, exactly:',
          'attachments: [], binding_id: "", bot_id: "", channel_id: "", conversation_id: "", draft_id: "", grant_id: "", observation_id: "",',
          'mention_bot_ids: [], mention_human_ids: [], recover: false, resolve_inbox_ids: [], freshness_override: {"draftVersion": 0, "reason": ""}.',
          'If the call returns an error, do not retry and do not drop any parameter; stop.',
        ].join(' '),
      );
      const sendCalls = async () => {
        const calls = (await ctx.toolCalls('aura')).filter(
          (call) => call.name === 'bot_send_message',
        );
        ctx.note({ botSendMessageCalls: calls });
        return calls;
      };
      try {
        await ctx.waitFor('Bot reply with 42', () =>
          ctx
            .messages(dm)
            .find(
              (message) =>
                ctx.isBot(message, 'aura') &&
                message.body.trim() === '42' &&
                !message.sessionFailure,
            ),
        );
      } catch (error) {
        const refused = (await sendCalls()).find((call) => call.isError);
        throw refused ? new Error(`no reply; bot_send_message refused: ${refused.result}`) : error;
      }
      const first = await ctx.waitFor(
        'a recorded result for the first bot_send_message call',
        async () => {
          const [call] = await sendCalls();
          return call?.hasResult ? call : undefined;
        },
      );
      const expected = {
        body: '42',
        attachments: [],
        binding_id: '',
        bot_id: '',
        channel_id: '',
        conversation_id: '',
        draft_id: '',
        grant_id: '',
        observation_id: '',
        mention_bot_ids: [],
        mention_human_ids: [],
        recover: false,
        resolve_inbox_ids: [],
        freshness_override: { draftVersion: 0, reason: '' },
      };
      const missing = Object.entries(expected)
        .filter(([key, value]) => JSON.stringify(first?.arguments?.[key]) !== JSON.stringify(value))
        .map(([key]) => key);
      if (missing.length > 0)
        throw new Error(
          `the first bot_send_message call did not send the empty fields (${missing.join(', ')}); nothing was tested`,
        );
      if (first.isError) throw new Error(`the schema-filled call was refused: ${first.result}`);
    },
  },
  {
    id: 'worker-reports-to-coordinator',
    summary: 'A worker woken by a Human mention reports to the coordinator with @, waking it.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(group, `请用一句话给出一个像素风 logo 的配色方案。${REPORT_RULE}`, [
        'aura',
      ]);
      await ctx.waitFor('Aura mentions Nexus and Nexus wakes', () =>
        ctx.messages(group).find((message) => ctx.mentionedAndWoken(message, 'aura', 'nexus')),
      );
    },
  },
  {
    id: 'two-workers-report',
    summary: 'Two workers from one Human kickoff each wake the coordinator once.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura', 'atlas'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura', 'atlas']);
      await ctx.humanSend(group, `你们两位各写一句游戏口号。${REPORT_RULE}`, ['aura', 'atlas']);
      await ctx.waitFor('Aura and Atlas each mention Nexus and wake it', () => {
        const messages = ctx.messages(group);
        const aura = messages.find((message) => ctx.mentionedAndWoken(message, 'aura', 'nexus'));
        const atlas = messages.find((message) => ctx.mentionedAndWoken(message, 'atlas', 'nexus'));
        return aura && atlas ? [aura, atlas] : undefined;
      });
    },
  },
  {
    id: 'coordinator-delegates',
    summary: 'The coordinator hands a task to a colleague with @, waking it.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(
        group,
        '请在群里 @美工 Aura，让她给出一个像素风 logo 的配色方案。大家都只在被 @ 时才会被唤醒。',
        ['nexus'],
      );
      await ctx.waitFor('Nexus mentions Aura and Aura wakes', () =>
        ctx.messages(group).find((message) => ctx.mentionedAndWoken(message, 'nexus', 'aura')),
      );
    },
  },
  {
    id: 'mid-sentence-report',
    summary: 'A worker writes @coordinator in the middle of its report, which still wakes it.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(
        group,
        '请用一句话给出一个像素风 logo 的配色方案。大家都只在被 @ 时才会被唤醒。汇报时把 @总控 Nexus 写在句子中间，例如：配色已完成，请 @总控 Nexus 查收。',
        ['aura'],
      );
      await ctx.waitFor('Aura mentions Nexus mid-sentence and Nexus wakes', () =>
        ctx.messages(group).find((message) => ctx.mentionedAndWoken(message, 'aura', 'nexus')),
      );
    },
  },
  {
    id: 'worker-to-worker-chain',
    summary: 'A worker hands off to another worker, who then reports to the coordinator.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura', 'atlas'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura', 'atlas']);
      await ctx.humanSend(
        group,
        `请先用一句话给出一个像素风配色方案，然后在群里 @叙事 Atlas，请他根据配色写一句游戏口号。Atlas 写完口号后 @总控 Nexus 汇报。${REPORT_RULE}`,
        ['aura'],
      );
      await ctx.waitFor('Aura wakes Atlas, then Atlas wakes Nexus', () => {
        const messages = ctx.messages(group);
        const handoff = messages.find((message) => ctx.mentionedAndWoken(message, 'aura', 'atlas'));
        const report = messages.find((message) => ctx.mentionedAndWoken(message, 'atlas', 'nexus'));
        return handoff && report ? [handoff, report] : undefined;
      });
    },
  },
  {
    id: 'delegate-and-report-back',
    summary:
      'The coordinator hands a task to a colleague in any way it chooses and the colleague reports back with @, a full round trip.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'atlas'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'atlas']);
      await ctx.humanSend(group, `请安排叙事 Atlas 写一句游戏口号。${REPORT_RULE}`, ['nexus']);
      await ctx.waitFor('Atlas, woken only by Nexus, reports back with @ and Nexus wakes', () => {
        const report = ctx
          .messages(group)
          .find(
            (message) =>
              ctx.isBot(message, 'atlas') &&
              (message.mentions ?? []).some((mention) => mention.botSlug === ctx.slug('nexus')),
          );
        const ask = ctx.woke('nexus', 'atlas');
        const answer = ctx.woke('atlas', 'nexus');
        return report && ask && answer ? [ask, answer, report] : undefined;
      });
    },
  },
  {
    id: 'repeat-reports',
    summary:
      'Two tasks in a row in one Group each wake the coordinator, so dedup keeps later reports.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(group, `请用一句话给出一个像素风 logo 的配色方案。${REPORT_RULE}`, [
        'aura',
      ]);
      const first = await ctx.waitFor('first report wakes Nexus', () =>
        ctx.messages(group).find((message) => ctx.mentionedAndWoken(message, 'aura', 'nexus')),
      );
      await ctx.humanSend(group, `再用一句话给出一个赛博朋克风的配色方案。${REPORT_RULE}`, [
        'aura',
      ]);
      await ctx.waitFor('second report wakes Nexus again', () => {
        const second = ctx
          .messages(group)
          .find(
            (message) =>
              message.id !== first.id &&
              message.channelRevision > first.channelRevision &&
              ctx.mentionedAndWoken(message, 'aura', 'nexus'),
          );
        return second ? [first, second] : undefined;
      });
    },
  },
  {
    id: 'unmentioned-stay-asleep',
    summary:
      'A worker that answers the Human without @ wakes no colleague in a mentions-only Group.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura', 'atlas'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura', 'atlas']);
      await ctx.humanSend(
        group,
        '请直接回复我：用一句话给出一个像素风 logo 的配色方案。这次不需要 @ 或通知任何同事。',
        ['aura'],
      );
      const reply = await ctx.waitFor('Aura replies', () =>
        ctx.messages(group).find((message) => ctx.isBot(message, 'aura')),
      );
      await ctx.settle(30);
      const woken = ctx
        .messages(group)
        .filter((message) => message.channelRevision >= reply.channelRevision)
        .flatMap((message) => message.deliveries ?? [])
        .filter(
          (delivery) =>
            [ctx.slug('nexus'), ctx.slug('atlas')].includes(delivery.botSlug) &&
            ['running', 'retryable', 'needs-repair', 'handled'].includes(delivery.state),
        );
      if (woken.length > 0)
        throw new Error(`a colleague woke without a mention: ${JSON.stringify(woken)}`);
    },
  },
  {
    id: 'long-task-reports',
    summary:
      'A multi-phase DM task with a one-minute step gets a receipt before the work starts, progress while it runs and a final result.',
    areas: [...RUNTIME_AREAS, 'packages/core/src/runtime/dsh-bot-agent-adapter.ts'],
    bots: ['aura'],
    async run(ctx) {
      const dm = await ctx.dm('aura');
      const files = ['drafts/palette.md', 'drafts/render.log', 'drafts/summary.md'];
      await ctx.humanSend(
        dm,
        `这是一个分三个阶段的长任务，请在你的记忆仓库里依次完成：阶段 1：写 ${files[0]}，列出 5 个像素风配色，每个含 3 个十六进制色值和一句说明；阶段 2：在记忆仓库目录运行 \`sleep 60 && echo rendered > ${files[1]}\` 模拟导出预览图，这一步大约要一分钟；阶段 3：写 ${files[2]}，挑出最好的一组并说明理由。全部完成后告诉我结果。`,
      );
      const [first, , last] = await ctx.waitFor('all three phase files are written', () => {
        const times = files.map((file) => ctx.memoryFileTime('aura', file));
        return times.every((time) => time !== undefined) ? times : undefined;
      });
      const replies = await ctx.waitFor('a final report after the last phase', () => {
        const messages = ctx.messages(dm).filter((message) => ctx.isBot(message, 'aura'));
        return messages.some((message) => Date.parse(message.at) > last) ? messages : undefined;
      });
      const at = replies.map((message) => Date.parse(message.at));
      if (!at.some((time) => time < first))
        throw new Error('no receipt was sent before the first phase started');
      if (!at.some((time) => time > first && time < last))
        throw new Error('no progress was reported while the later phases ran');
    },
  },
  {
    id: 'department-task',
    summary:
      'A Human hands one task to a Group where every Bot wakes on every message; the colleagues start, work it through together, deliver, and then go quiet.',
    areas: [...RUNTIME_AREAS, 'packages/core/src/runtime/dsh-bot-agent-adapter.ts'],
    bots: ['nexus', 'aura', 'atlas', 'vera'],
    async run(ctx) {
      const group = await ctx.group(['nexus', 'aura', 'atlas', 'vera'], 'all');
      await ctx.humanSend(
        group,
        '部门任务：为新游戏《像素远征》做一份发布方案。美工 Aura 给出一套像素风配色（3 个色值），叙事 Atlas 写 3 句宣传口号，质检 Vera 审核两份产出并对每份至少提一条修改意见，Aura 和 Atlas 按意见修改，最后总控 Nexus 汇总成最终方案发在群里，以「【最终方案】」开头。由 Nexus 负责推进，大家自己协调。',
      );
      const isBot = (message) =>
        ['nexus', 'aura', 'atlas', 'vera'].some((key) => ctx.isBot(message, key));
      const final = await ctx.waitFor(
        'Nexus posts the final plan after everyone contributed',
        () => {
          const messages = ctx.messages(group);
          const done = messages.find(
            (message) =>
              ctx.isBot(message, 'nexus') && /^(?:@\S+\s*)*【最终方案】/.test(message.body.trim()),
          );
          const everyone = ['aura', 'atlas', 'vera'].every((key) =>
            messages.some((message) => ctx.isBot(message, key)),
          );
          return done && everyone ? done : undefined;
        },
      );
      const revised = ['aura', 'atlas'].every(
        (key) =>
          ctx
            .messages(group)
            .filter(
              (message) =>
                ctx.isBot(message, key) && message.channelRevision < final.channelRevision,
            ).length >= 2,
      );
      if (!revised) throw new Error('Aura and Atlas did not both revise after the review');
      const quietBy = Date.now() + 300_000;
      for (;;) {
        await ctx.settle(10);
        const newest = Date.parse(ctx.messages(group).filter(isBot).at(0)?.at ?? final.at);
        if (Date.now() - newest >= 60_000) break;
        if (Date.now() >= quietBy)
          throw new Error('the Group had not gone quiet five minutes after the final plan');
      }
      const after = ctx
        .messages(group)
        .filter((message) => isBot(message) && message.channelRevision > final.channelRevision);
      const total = ctx.messages(group).filter(isBot).length;
      ctx.note({ botMessages: total, afterFinal: after.length });
      if (after.length > 2)
        throw new Error(`the Group kept talking after the final plan: ${after.length} messages`);
    },
  },
  {
    id: 'review-rounds',
    summary:
      'A reviewer sends the work back to a colleague three times from one Human kickoff, and every round wakes the colleague (#2872).',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(
        group,
        '请你和美工 Aura 迭代一个像素风 logo 的配色，一共三轮：第 1 轮请她给出初版；第 2 轮无论初版如何都请她改成暖色调；第 3 轮请她再加一个强调色。每一轮都在群里 @美工 Aura 提出要求，等她 @ 你汇报后再提下一轮。第三版完成后在群里简短总结。大家都只在被 @ 时才会被唤醒，Aura 每次改完必须 @总控 Nexus 汇报。',
        ['nexus'],
      );
      await ctx.waitFor('Nexus wakes Aura three times and Aura reports back each time', () => {
        const messages = ctx.messages(group);
        const asks = messages.filter((message) => ctx.mentionedAndWoken(message, 'nexus', 'aura'));
        const reports = messages.filter((message) =>
          ctx.mentionedAndWoken(message, 'aura', 'nexus'),
        );
        return asks.length >= 3 && reports.length >= 3 ? [...asks, ...reports] : undefined;
      });
    },
  },
  {
    id: 'tob-share-draft-secret',
    summary:
      'Tob reviews a Share Draft, asks the Human about a planted secret, drops it on the answer, and leaves the source Memory untouched (#3060).',
    areas: [
      'packages/core/src/marketplace/',
      'packages/core/src/tob/',
      'packages/core/src/bots/cli-share-draft.ts',
      'scripts/e2e-llm-scenarios.mjs',
    ],
    bots: ['atlas'],
    async run(ctx) {
      const slug = ctx.slug('atlas');
      const memory = ctx.memoryDir('atlas');
      const secret = 'notes/keys.md';
      mkdirSync(join(memory, 'notes'), { recursive: true });
      writeFileSync(
        join(memory, secret),
        '# 部署笔记\n\nOpenAI key: sk-e2eplanted0000secret0000value\n',
      );
      writeFileSync(join(memory, 'notes/story.md'), '# 故事\n\n一只像素猫在雨夜里找到回家的路。\n');
      const git = (...args) =>
        execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@local', ...args], {
          cwd: memory,
          encoding: 'utf8',
          shell: false,
          windowsHide: true,
        });
      git('add', '-A');
      git('commit', '-q', '-m', 'e2e share fixture');
      const head = git('rev-parse', 'HEAD').trim();
      const before = readFileSync(join(memory, secret), 'utf8');
      const started = await ctx.host('shareDraftStart', { slug });
      const flagged = started.files.find((file) => file.path === secret);
      if (!flagged || flagged.flags.length === 0) throw new Error('planted secret was not flagged');
      const tob = await ctx.tob();
      await ctx.humanSend(
        tob,
        `帮我把「${CAST.atlas.displayName}」分享出去：逐个检查它的分享草稿，看起来涉及隐私的内容问我保留、改写还是删掉。（Bot ID：${slug}）`,
      );
      const answered = new Set();
      const draft = await ctx.waitFor(
        'Tob asks about the planted secret and the Share Draft finishes with it dropped',
        async () => {
          for (const message of ctx.messages(tob)) {
            const request = message.userQuestionRequest;
            if (request === undefined || answered.has(message.id)) continue;
            answered.add(message.id);
            const answers = request.questions.map((question) => {
              const text = `${question.header ?? ''} ${question.question} ${question.detail ?? ''}`;
              const options = (question.options ?? []).map((option) => option.label);
              const aboutSecret = text.includes('keys.md') || /sk-|key|密钥/iu.test(text);
              const wanted = aboutSecret ? /drop|删|移除|不分享/iu : /keep|保留/iu;
              const pick = options.find((label) => wanted.test(label));
              return pick === undefined
                ? {
                    id: question.id,
                    selected: [],
                    custom: aboutSecret ? '删掉这个文件' : '保留',
                  }
                : { id: question.id, selected: [pick] };
            });
            ctx.note({
              [`question-${message.id}`]: {
                questions: request.questions,
                answers,
              },
            });
            await ctx.host('userQuestionAnswer', {
              channelId: tob,
              messageId: message.id,
              answer: { answers },
            });
          }
          const current = await ctx.host('shareDraftGet', { slug }).catch(() => undefined);
          return answered.size > 0 && current?.state === 'ready' ? current : undefined;
        },
      );
      const file = draft.files.find((entry) => entry.path === secret);
      if (file?.status !== 'dropped') throw new Error(`planted secret ended ${file?.status}`);
      if (readFileSync(join(memory, secret), 'utf8') !== before)
        throw new Error('source Memory file changed');
      if (git('rev-parse', 'HEAD').trim() !== head || git('status', '--porcelain').trim() !== '')
        throw new Error('source Memory repository changed');
      ctx.note({ draft: draft.summary });
    },
  },
  {
    id: 'browser-youtube-search',
    summary:
      'A Human asks a Bot with Browser Access to search YouTube; its current Bot Browser tab ends on the results page for that query (#3377).',
    areas: [
      'packages/browser/',
      'packages/computer/',
      'packages/core/src/runtime/',
      'scripts/e2e-llm-scenarios.mjs',
    ],
    bots: ['aura'],
    external: true,
    async run(ctx) {
      const slug = ctx.slug('aura');
      await ctx.host('browserAccessSet', { slug, enabled: true });
      const query = 'lofi hip hop';
      const dm = await ctx.dm('aura');
      await ctx.humanSend(
        dm,
        `打开 YouTube（https://www.youtube.com），在页面的搜索框里搜索「${query}」，停在搜索结果页，然后告诉我前三个视频的标题。`,
      );
      try {
        const observed = await ctx.waitFor(
          'The current Bot Browser tab is a YouTube results page for the query and the Bot replied',
          async () => {
            const observation = await ctx.browserObservation(slug).catch(() => undefined);
            const tab = (observation?.tabs ?? []).find((entry) => entry.current);
            const onResults =
              tab !== undefined && youtubeResultsQuery(tab.url) === query.toLowerCase();
            const replied = ctx.messages(dm).some((message) => ctx.isBot(message, 'aura'));
            return onResults && replied ? { url: tab.url, title: tab.title } : undefined;
          },
        );
        ctx.note({ result: observed });
      } finally {
        const calls = await ctx.toolCalls('aura').catch(() => []);
        ctx.note({
          finalBrowser: await ctx.browserObservation(slug).catch((error) => String(error)),
          browserCalls: calls
            .filter((call) => call.name.startsWith('browser_'))
            .map((call) => ({
              name: call.name,
              isError: call.isError,
              arguments: call.arguments,
              result: call.isError ? call.result.slice(0, 400) : undefined,
            })),
        });
        await ctx.noteDiagnostics('aura');
      }
    },
  },
];

export function youtubeResultsQuery(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!/(^|\.)youtube\.com$/u.test(parsed.hostname) || parsed.pathname !== '/results')
    return undefined;
  const value = parsed.searchParams.get('search_query');
  return value === null ? undefined : value.trim().replace(/\s+/gu, ' ').toLowerCase();
}
