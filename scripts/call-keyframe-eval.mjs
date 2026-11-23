#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

import { CASES, SAMPLE_MS, generateFixture } from './call-keyframe-fixtures.mjs';

export { CASES, generateFixture } from './call-keyframe-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

export const usage = `Usage: node scripts/call-keyframe-eval.mjs [options]

Generate six call videos with known ground truth (VC8, #3499), run the shared keyframe picker
over them and judge each case automatically. With --bot it also drives every case through a
real Host call (deepseekbot call-simulate --screen/--video plus a typed question) and judges
the Bot's spoken answer, so the model must be the latest DeepSeek model (opencode-go).

Cases: reading, scroll, windows, movie, camera, silence (5 minutes, then a question).

Options:
  --case <id>          Run only this case (repeatable).
  --compare            Also sweep the grayscale pixel difference against a perceptual hash
                       (pHash) over several thresholds and print which settings pass every case.
  --bot <id>           Live: call this Bot on the Host (otherwise the picker runs offline only).
  --name <instance>    verify-app instance whose Host to call (default vc8), read from
                       .humanlayer/verify/<name>/instance.json; DEEPSEEKBOT_HOST and
                       DEEPSEEKBOT_HOST_TOKEN in the environment take precedence.
  --stub-voice         Live: start a local stand-in ASR/TTS endpoint and bind it to the Bot, for
                       an isolated Host without real voice Providers. Questions are typed, so
                       recognition is never needed, and replies play as silence of speech length;
                       the stand-in Providers are removed when the run ends.
  --reply-wait <s>     Seconds to wait for each answer (default 150).
  --out <dir>          Report folder (default .humanlayer/call-keyframe-eval/<time>/): fixtures,
                       report.json, report.md and every grid image the Host composed.

Exit status is 1 when a selected case fails.`;

async function loadSharp() {
  const entry = require.resolve('sharp', { paths: [join(root, 'packages/core')] });
  return (await import(pathToFileURL(entry).href)).default;
}

async function loadKeyframes() {
  const { unrun } = await import(pathToFileURL(require.resolve('unrun', { paths: [root] })).href);
  return (await unrun({ path: join(root, 'packages/core/src/voice/keyframes.ts') })).module;
}

export function judgePicks(spec, samples, picks) {
  const counts = new Map();
  for (const sample of samples) if (sample.segment !== null) counts.set(sample.segment, 0);
  let moving = 0;
  let transitions = 0;
  for (const index of picks) {
    const sample = samples[index];
    if (sample === undefined) continue;
    if (sample.moving) moving += 1;
    if (sample.segment === null) transitions += 1;
    else counts.set(sample.segment, (counts.get(sample.segment) ?? 0) + 1);
  }
  const reasons = [];
  const expect = spec.expect;
  if (
    expect.total !== undefined &&
    (picks.length < expect.total[0] || picks.length > expect.total[1])
  )
    reasons.push(`${picks.length} keyframes, expected ${expect.total[0]}–${expect.total[1]}`);
  if (expect.perSegment !== undefined)
    for (const [segment, count] of counts)
      if (count < expect.perSegment[0] || count > expect.perSegment[1])
        reasons.push(`${segment}: ${count} keyframes, expected ${expect.perSegment.join('–')}`);
  if (expect.noMoving === true && moving > 0) reasons.push(`${moving} keyframes caught mid-motion`);
  if (
    expect.maxTotalPerSegment !== undefined &&
    picks.length > Math.ceil(counts.size * expect.maxTotalPerSegment)
  )
    reasons.push(
      `${picks.length} keyframes for ${counts.size} segments, at most ${Math.ceil(counts.size * expect.maxTotalPerSegment)}`,
    );
  return {
    keyframes: picks.length,
    perSegment: Object.fromEntries(counts),
    transitions,
    moving,
    pass: reasons.length === 0,
    reasons,
  };
}

export function judgeAnswer(answer, text) {
  const lower = text.toLowerCase();
  const find = (group) =>
    Math.min(
      ...group.map((word) => {
        const at = lower.indexOf(word.toLowerCase());
        return at < 0 ? Number.POSITIVE_INFINITY : at;
      }),
    );
  const positions = answer.groups.map(find);
  const missing = answer.groups.filter((_, index) => !Number.isFinite(positions[index]));
  const reasons = missing.map((group) => `missing ${group[0]}`);
  if (answer.ordered === true && missing.length === 0)
    for (let index = 1; index < positions.length; index += 1)
      if (positions[index] < positions[index - 1])
        reasons.push(`${answer.groups[index][0]} came before ${answer.groups[index - 1][0]}`);
  return { pass: reasons.length === 0, reasons };
}

export async function pickFolder(folder, count, options, sharp, keyframes) {
  const picker = keyframes.createKeyframePicker(options);
  const picks = [];
  let bytes = 0;
  let pickMs = 0;
  for (let index = 0; index < count; index += 1) {
    const file = join(folder, `${String(index + 1).padStart(5, '0')}.jpg`);
    const data = readFileSync(file);
    const started = performance.now();
    const thumb = await sharp(data)
      .resize({ width: options.thumbWidth })
      .greyscale()
      .raw()
      .toBuffer();
    const decision = picker.push(new Uint8Array(thumb), index * SAMPLE_MS);
    pickMs += performance.now() - started;
    if (decision.keyframe) {
      picks.push(index);
      bytes += data.byteLength;
    }
  }
  return { picks, bytes, pickMs: Math.round(pickMs) };
}

export function sweepConfigs(defaults) {
  const configs = [];
  const add = (source, name, options) =>
    configs.push({ source, name, options: { ...defaults[source], detail: undefined, ...options } });
  for (const threshold of [0.002, 0.004, 0.008, 0.016])
    add('screen', 'pixel', { metric: 'pixel', threshold, stillness: 0.001 });
  for (const threshold of [0.06, 0.1, 0.16])
    add('screen', 'phash', { metric: 'phash', threshold, stillness: 0.04 });
  for (const threshold of [0.1, 0.16])
    for (const detail of [0.01, 0.015, 0.02, 0.03])
      add('screen', 'phash+detail', {
        metric: 'phash',
        threshold,
        stillness: 0.04,
        detail: { threshold: detail, stillness: 0.004 },
      });
  for (const threshold of [0.02, 0.03, 0.04, 0.08])
    add('camera', 'pixel', { metric: 'pixel', threshold, stillness: 0.04 });
  for (const threshold of [0.06, 0.1, 0.12, 0.16, 0.24])
    add('camera', 'phash', { metric: 'phash', threshold, stillness: 0.04 });
  return configs;
}

function cli(env) {
  const run = promisify(execFile);
  const entry = join(root, 'packages/deepseekbot/dist/deepseekbot.mjs');
  if (!existsSync(entry)) throw new Error('Build the CLI first: pnpm build.');
  return async (args, timeout = 120_000) => {
    const { stdout } = await run(process.execPath, [entry, ...args, '--compact'], {
      env,
      windowsHide: true,
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
    });
    return JSON.parse(stdout);
  };
}

function hostEnv(name) {
  if (process.env.DEEPSEEKBOT_HOST && process.env.DEEPSEEKBOT_HOST_TOKEN) return { ...process.env };
  const path = join(root, '.humanlayer/verify', name, 'instance.json');
  if (!existsSync(path))
    throw new Error(
      `No Host: launch one with node scripts/verify-app.mjs launch --name ${name} --build, or set DEEPSEEKBOT_HOST and DEEPSEEKBOT_HOST_TOKEN.`,
    );
  const login = new URL(JSON.parse(readFileSync(path, 'utf8')).url);
  return {
    ...process.env,
    DEEPSEEKBOT_HOST: login.origin,
    DEEPSEEKBOT_HOST_TOKEN: login.searchParams.get('token') ?? '',
  };
}

async function fetchAttachment(host, channelId, messageId, fileId) {
  if (!host.cookie) {
    const login = new URL(host.origin);
    login.searchParams.set('token', host.token);
    const response = await fetch(login, { redirect: 'manual' });
    await response.body?.cancel();
    host.cookie = response.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
  }
  const url = new URL('/api/botharness/attachment', host.origin);
  url.search = new URLSearchParams({ fileId, channelId, messageId }).toString();
  const response = await fetch(url, { headers: { cookie: host.cookie } });
  if (!response.ok) {
    await response.body?.cancel();
    return undefined;
  }
  return Buffer.from(await response.arrayBuffer());
}

function wav(ms) {
  const count = Math.round(16 * ms);
  const out = Buffer.alloc(44 + count * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + count * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(16_000, 24);
  out.writeUInt32LE(32_000, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(count * 2, 40);
  return out;
}

async function stubVoice() {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      if (request.url?.endsWith('/audio/speech')) {
        let text = '';
        try {
          text = JSON.parse(body).input ?? '';
        } catch {}
        const audio = wav(Math.min(4_000, 200 + text.length * 60));
        response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': audio.length });
        return response.end(audio);
      }
      if (request.url?.endsWith('/audio/transcriptions')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        return response.end('{"text":""}');
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

async function bindStub(run, bot, baseUrl) {
  const tts = await run([
    'voice-provider-add',
    'custom',
    '--name',
    'VC8 stub TTS',
    '--base-url',
    baseUrl,
    '--model',
    'stub',
    '--voice',
    'stub',
  ]);
  const asr = await run([
    'voice-provider-add',
    'custom',
    '--kind',
    'asr',
    '--name',
    'VC8 stub ASR',
    '--base-url',
    baseUrl,
    '--model',
    'stub',
  ]);
  await run(['voice-set', bot, tts.provider.id]);
  await run(['voice-asr-set', bot, asr.provider.id]);
  return [tts.provider.id, asr.provider.id];
}

async function liveCase(spec, samples, folder, out, run, host, bot, replyWait) {
  const durationMs = samples.length * SAMPLE_MS;
  const script = join(out, `${spec.id}-script.json`);
  writeFileSync(script, JSON.stringify([{ at: durationMs + 1_000, text: spec.question }]));
  const report = await run(
    [
      'call-simulate',
      bot,
      '--script',
      script,
      spec.source === 'camera' ? '--video' : '--screen',
      folder,
      '--reply-wait',
      String(replyWait),
    ],
    durationMs + replyWait * 1000 + 120_000,
  );
  writeFileSync(join(out, `${spec.id}-call.json`), JSON.stringify(report, null, 2));
  const events = report.events ?? [];
  const visual = report.visual ?? {};
  const question = report.texts?.[0];
  const textEvent = events.find((event) => event.type === 'text');
  const gridSent = events.find(
    (event) => event.type === 'grid-sent' && event.messageId === question?.messageId,
  );
  const shownAt = gridSent?.at ?? textEvent?.at;
  const firstAudio = events.find(
    (event) => event.type === 'playing' && shownAt !== undefined && event.at >= shownAt,
  );
  const page = await run(['channel-messages', `dm-${bot}`, '--limit', '60']);
  const messages = page.messages ?? [];
  const asked = messages.find((message) => message.id === question?.messageId);
  const answerText = messages
    .filter(
      (message) =>
        message.author?.kind === 'bot' &&
        asked !== undefined &&
        Date.parse(message.at) >= Date.parse(asked.at),
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((message) => message.body ?? '')
    .join('\n');
  const gridFiles = [];
  const pictured = messages
    .filter(
      (message) =>
        message.id === question?.messageId ||
        (message.voiceCallRecord?.state === 'frames' &&
          message.voiceCallRecord?.callId === report.callId),
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const message of pictured)
    for (const attachment of message.attachments ?? []) {
      if (attachment.fileId === undefined) continue;
      const file = join(out, 'grids', `${spec.id}-${gridFiles.length + 1}.jpg`);
      mkdirSync(dirname(file), { recursive: true });
      const bytes = await fetchAttachment(host, `dm-${bot}`, message.id, attachment.fileId);
      if (bytes === undefined) continue;
      writeFileSync(file, bytes);
      gridFiles.push(file);
    }
  const answer = judgeAnswer(spec.answer, answerText);
  const reasons = [...answer.reasons];
  if (!report.answered) {
    const failed = events.find((event) => event.type === 'playback-failed');
    reasons.push(failed === undefined ? 'no spoken answer' : `no spoken answer (${failed.code})`);
  }
  if ((visual.harvest?.dropped ?? 0) > 0)
    reasons.push(`${visual.harvest.dropped} keyframes dropped`);
  if ((visual.failed ?? []).length > 0) reasons.push(`grid failed: ${visual.failed.join('; ')}`);
  const composeMs = [...(visual.grids ?? []), ...(visual.records ?? [])].map(
    (grid) => grid.composeMs,
  );
  return {
    callId: report.callId,
    keyframes: visual.keyframes,
    sentFrames: visual.sentFrames,
    uplinkBytes: visual.frameBytes,
    grids: (visual.grids ?? []).map((grid) => ({
      frames: grid.frames,
      layout: grid.layout,
      bytes: grid.bytes,
      composeMs: grid.composeMs,
    })),
    records: (visual.records ?? []).length,
    composeMs: { max: Math.max(0, ...composeMs), total: composeMs.reduce((a, b) => a + b, 0) },
    seeToSpeakMs:
      firstAudio === undefined || shownAt === undefined ? null : firstAudio.at - shownAt,
    firstTextMs: report.firstTextMs,
    zooms: events.filter((event) => event.type === 'frame-zoomed').length,
    answer: answerText,
    gridFiles: gridFiles.map((file) => file.slice(out.length + 1)),
    pass: reasons.length === 0,
    reasons,
  };
}

function markdown(report) {
  const lines = [`# VC8 keyframe evaluation`, '', `- Started: ${report.startedAt}`];
  if (report.model) lines.push(`- Model: ${report.model}`);
  lines.push(
    '',
    '## Picker (shipped defaults)',
    '',
    '| Case | Source | Samples | Keyframes | Uplink KB | Pick ms | Result |',
    '|---|---|---|---|---|---|---|',
  );
  for (const entry of report.cases)
    lines.push(
      `| ${entry.id} | ${entry.source} | ${entry.samples} | ${entry.picker.keyframes} | ${(entry.picker.bytes / 1024).toFixed(0)} | ${entry.picker.pickMs} | ${entry.picker.pass ? 'pass' : `FAIL: ${entry.picker.reasons.join('; ')}`} |`,
    );
  if (report.cases.some((entry) => entry.live !== undefined)) {
    lines.push(
      '',
      '## Live calls',
      '',
      '| Case | Keyframes | Uplink KB | Grids (layout) | Records | Compose max ms | See-to-speak ms | Zooms | Result |',
      '|---|---|---|---|---|---|---|---|---|',
    );
    for (const entry of report.cases) {
      const live = entry.live;
      if (live === undefined) continue;
      if (live.error !== undefined) {
        lines.push(`| ${entry.id} | | | | | | | | ERROR: ${live.error} |`);
        continue;
      }
      lines.push(
        `| ${entry.id} | ${live.keyframes} | ${((live.uplinkBytes ?? 0) / 1024).toFixed(0)} | ${live.grids.map((grid) => grid.layout).join(', ')} | ${live.records} | ${live.composeMs.max} | ${live.seeToSpeakMs ?? '—'} | ${live.zooms} | ${live.pass ? 'pass' : `FAIL: ${live.reasons.join('; ')}`} |`,
      );
    }
    lines.push('', '### Answers', '');
    for (const entry of report.cases)
      if (entry.live?.answer !== undefined)
        lines.push(`- **${entry.id}**: ${entry.live.answer.replaceAll('\n', ' ')}`);
  }
  if (report.compare !== undefined) {
    lines.push(
      '',
      '## Pixel difference vs perceptual hash',
      '',
      '| Source | Metric | Threshold | Stillness | Detail | Cases passed | Keyframes | Pick ms |',
      '|---|---|---|---|---|---|---|---|',
    );
    for (const row of report.compare)
      lines.push(
        `| ${row.source} | ${row.metric} | ${row.threshold} | ${row.stillness} | ${row.detail ?? '—'} | ${row.passed}/${row.cases}${row.failed.length ? ` (${row.failed.join(', ')})` : ''} | ${row.keyframes} | ${row.pickMs} |`,
      );
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      case: { type: 'string', multiple: true },
      compare: { type: 'boolean' },
      bot: { type: 'string' },
      name: { type: 'string', default: 'vc8' },
      'stub-voice': { type: 'boolean' },
      'reply-wait': { type: 'string', default: '150' },
      out: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(usage);
    return 0;
  }
  const selected = values.case ?? CASES.map((spec) => spec.id);
  const unknown = selected.filter((id) => !CASES.some((spec) => spec.id === id));
  if (unknown.length > 0) throw new Error(`Unknown case: ${unknown.join(', ')}`);
  const replyWait = Number(values['reply-wait']);
  if (!Number.isFinite(replyWait) || replyWait < 10 || replyWait > 240)
    throw new Error('--reply-wait must be 10–240 seconds.');
  const out = resolve(
    values.out ??
      join(root, '.humanlayer/call-keyframe-eval', new Date().toISOString().replaceAll(':', '-')),
  );
  mkdirSync(out, { recursive: true });
  const sharp = await loadSharp();
  const keyframes = await loadKeyframes();
  const report = {
    startedAt: new Date().toISOString(),
    defaults: keyframes.KEYFRAME_DEFAULTS,
    cases: [],
  };
  const fixtures = new Map();
  for (const id of selected) {
    const spec = CASES.find((entry) => entry.id === id);
    const folder = join(out, 'fixtures', spec.id);
    const started = performance.now();
    const samples = await generateFixture(spec, folder, sharp);
    fixtures.set(spec.id, { spec, samples, folder });
    const options = keyframes.KEYFRAME_DEFAULTS[spec.source];
    const picked = await pickFolder(folder, samples.length, options, sharp, keyframes);
    report.cases.push({
      id: spec.id,
      title: spec.title,
      source: spec.source,
      samples: samples.length,
      generateMs: Math.round(performance.now() - started),
      picker: {
        ...judgePicks(spec, samples, picked.picks),
        picks: picked.picks,
        bytes: picked.bytes,
        pickMs: picked.pickMs,
      },
    });
    console.error(
      `${spec.id}: ${picked.picks.length} keyframes ${report.cases.at(-1).picker.pass ? 'pass' : 'FAIL'}`,
    );
  }
  if (values.compare) {
    report.compare = [];
    for (const config of sweepConfigs(keyframes.KEYFRAME_DEFAULTS)) {
      const entries = [...fixtures.values()].filter((entry) => entry.spec.source === config.source);
      if (entries.length === 0) continue;
      const row = {
        source: config.source,
        metric: config.name,
        threshold: config.options.threshold,
        stillness: config.options.stillness,
        detail: config.options.detail?.threshold ?? null,
        cases: entries.length,
        passed: 0,
        failed: [],
        keyframes: 0,
        pickMs: 0,
      };
      for (const { spec, samples, folder } of entries) {
        const picked = await pickFolder(folder, samples.length, config.options, sharp, keyframes);
        const judged = judgePicks(spec, samples, picked.picks);
        row.keyframes += picked.picks.length;
        row.pickMs += picked.pickMs;
        if (judged.pass) row.passed += 1;
        else row.failed.push(`${spec.id}: ${judged.reasons[0]}`);
      }
      report.compare.push(row);
    }
  }
  if (values.bot !== undefined) {
    const env = hostEnv(values.name);
    const run = cli(env);
    const host = { origin: env.DEEPSEEKBOT_HOST, token: env.DEEPSEEKBOT_HOST_TOKEN, cookie: '' };
    let stub;
    let stubProviders = [];
    if (values['stub-voice']) {
      stub = await stubVoice();
      stubProviders = await bindStub(run, values.bot, stub.baseUrl);
    }
    try {
      for (const entry of report.cases) {
        const { spec, samples, folder } = fixtures.get(entry.id);
        console.error(
          `${spec.id}: live call (${(samples.length * SAMPLE_MS) / 1000} s of ${spec.source})…`,
        );
        try {
          entry.live = await liveCase(spec, samples, folder, out, run, host, values.bot, replyWait);
        } catch (error) {
          entry.live = {
            pass: false,
            error: error instanceof Error ? error.message.slice(0, 300) : 'failed',
            reasons: ['error'],
          };
        }
        console.error(
          `${spec.id}: ${entry.live.pass ? 'pass' : `FAIL ${entry.live.reasons.join('; ')}`}`,
        );
      }
    } finally {
      for (const provider of stubProviders)
        await run(['voice-provider-remove', provider]).catch(() => undefined);
      stub?.server.close();
    }
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(out, 'report.md'), markdown(report));
  process.stdout.write(markdown(report));
  console.error(`Report: ${join(out, 'report.md')}`);
  const failed = report.cases.some((entry) => !entry.picker.pass || entry.live?.pass === false);
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
