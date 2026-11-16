import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const worker = process.argv.includes('--worker');
if (!worker && !/^[a-f0-9]{40}$/.test(argument('--source-sha') ?? ''))
  throw new Error('Pass the frozen 40-character --source-sha.');
const instancePath = argument('--instance');
const fixturePath = argument('--fixture');
if (!instancePath || !fixturePath)
  throw new Error('Pass --instance and --fixture private JSON paths.');
const fixtureBytes = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes);
if (
  !fixture ||
  !['bot', 'from', 'to'].every((key) => typeof fixture[key] === 'string' && fixture[key].trim())
)
  throw new Error('Fixture requires bot, from and to.');
const budget = JSON.parse(
  readFileSync(argument('--budget') ?? new URL('./perf-budgets/cli-effects.json', import.meta.url)),
);
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const expectedSelection = (choice) =>
  choice === 'off' ? null : choice === 'inherit' ? '@global' : choice;
const validTiming = (row) =>
  row.correct === true &&
  row.code === 0 &&
  row.processCode === 0 &&
  Number.isFinite(row.wallMs) &&
  row.wallMs >= 0 &&
  Number.isFinite(row.maxRssKiB) &&
  row.maxRssKiB > 0;

if (worker) {
  const started = performance.now();
  const operation = argument('--operation');
  if (operation === 'classification') {
    const { toolEffects } = await import(
      new URL('../packages/core/dist/index.mjs', import.meta.url)
    );
    const cases = [
      { name: 'read', argv: ['channels'], expected: { changes: 'none' } },
      {
        name: 'management',
        argv: ['grant-write-set', fixture.bot, '--grant', 'fixture', '--enabled', '--confirm'],
        expected: { authority: 'management' },
      },
      {
        name: 'external-output',
        argv: ['marketplace-upload', fixture.bot, '--out=fixture.json'],
        expected: { changes: 'irreversible', reach: 'external' },
      },
      {
        name: 'max-argv-read',
        argv: ['channels', ...Array(255).fill('--compact')],
        expected: { changes: 'none' },
      },
    ];
    const rows = cases.map((test) => {
      const samples = [];
      let effects;
      for (let i = 0; i < 200; i++) {
        const at = performance.now();
        effects = toolEffects('deepseekbot ' + test.argv[0], { patch: { argv: test.argv } });
        samples.push(performance.now() - at);
      }
      return {
        name: test.name,
        argc: test.argv.length,
        correct:
          !!effects &&
          Object.entries(test.expected).every(([key, value]) => effects[key] === value),
        samplesMs: samples,
        p50Ms: quantile(samples, 0.5),
        p99Ms: quantile(samples, 0.99),
        effects,
      };
    });
    process.stdout.write(
      JSON.stringify({ code: 0, rows, maxRssKiB: process.resourceUsage().maxRSS }),
    );
  } else {
    const instance = JSON.parse(readFileSync(instancePath));
    const url = new URL(instance.url);
    const token = url.searchParams.get('token');
    if (!token) throw new Error('Private instance has no login token.');
    const { runBotCreateCli } = await import(
      new URL('../packages/core/cli/index.mjs', import.meta.url)
    );
    const commands = {
      list: ['list', '--compact'],
      set: ['approval-template-set', fixture.bot, fixture.to, '--compact'],
      read: ['approval-templates', '--bot', fixture.bot, '--compact'],
      restore: ['approval-template-set', fixture.bot, fixture.from, '--compact'],
    };
    if (!Object.hasOwn(commands, operation)) throw new Error('Unknown operation.');
    let stdout = '';
    const code = await runBotCreateCli(commands[operation], {
      env: { ...process.env, DEEPSEEKBOT_HOST: url.origin, DEEPSEEKBOT_HOST_TOKEN: token },
      stdout: (text) => (stdout += text),
      stderr: () => {},
      readStdin: async () => '',
    });
    const response = JSON.parse(stdout);
    const selected = operation === 'read' ? response.selected : response.bot?.approvalTemplate;
    const correct =
      code === 0 &&
      (operation === 'list'
        ? response.bots.some((bot) => (bot.id ?? bot.slug) === fixture.bot)
        : (selected ?? null) ===
          expectedSelection(operation === 'restore' ? fixture.from : fixture.to));
    process.stdout.write(
      JSON.stringify({
        code,
        correct,
        operation,
        selected,
        elapsedMs: performance.now() - started,
        maxRssKiB: process.resourceUsage().maxRSS,
        cpu: process.cpuUsage(),
        error: response.error?.code,
      }),
    );
  }
} else {
  const output = argument('--output');
  if (!output) throw new Error('Pass --output.');
  const run = (operation) =>
    new Promise((resolve) => {
      const at = performance.now();
      execFile(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          '--worker',
          '--instance',
          instancePath,
          '--fixture',
          fixturePath,
          '--operation',
          operation,
        ],
        {
          cwd: root,
          env: process.env,
          shell: false,
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 1000000,
        },
        (error, stdout) => {
          try {
            resolve({
              ...JSON.parse(stdout),
              wallMs: performance.now() - at,
              processCode: error?.code ?? 0,
            });
          } catch {
            resolve({
              operation,
              processCode: error?.code ?? 1,
              error: 'worker-output-unavailable',
            });
          }
        },
      );
    });
  const samples = [],
    restorations = [],
    failures = [];
  let baseline;
  const baselinePath = argument('--baseline');
  if (baselinePath) {
    try {
      baseline = JSON.parse(readFileSync(baselinePath));
      if (baseline?.fixtureSha256 !== hash(fixtureBytes) || baseline?.node !== process.version)
        failures.push('baseline:unmatched-fixture-or-node');
      if (!Array.isArray(baseline?.budget?.failures) || baseline.budget.failures.length)
        failures.push('baseline:failed');
      for (const operation of ['list', 'set', 'read']) {
        const rows = Array.isArray(baseline?.samples)
          ? baseline.samples.filter((row) => row?.operation === operation)
          : [];
        if (rows.length !== 3 || !rows.every(validTiming))
          failures.push('baseline:invalid-samples:' + operation);
      }
    } catch {
      failures.push('baseline:unavailable');
    }
  }
  if (!failures.length) {
    for (let round = 0; round < 3; round++) {
      try {
        for (const operation of ['list', 'set', 'read']) {
          const row = { round, ...(await run(operation)) };
          samples.push(row);
          if (!validTiming(row)) {
            failures.push(operation + ':incorrect');
            break;
          }
        }
      } catch {
        failures.push('worker-failed');
      } finally {
        let restore;
        try {
          restore = await run('restore');
        } catch {
          restore = { operation: 'restore', correct: false, error: 'worker-failed' };
        }
        restorations.push({ round, ...restore });
        if (!restore.correct || restore.processCode !== 0) failures.push('fixture-restore-failed');
      }
      if (failures.length) break;
    }
  }
  const classification =
    !failures.length && process.argv.includes('--classification')
      ? await run('classification')
      : undefined;
  const result = {
    source: argument('--source-sha'),
    node: process.version,
    fixtureSha256: hash(fixtureBytes),
    artifacts: ['packages/core/cli/index.mjs', 'packages/core/dist/index.mjs'].map((file) => ({
      file,
      sha256: hash(readFileSync(new URL('../' + file, import.meta.url))),
    })),
    samples,
    restorations,
    classification,
  };
  for (const row of samples) {
    if (!row.correct || row.processCode !== 0) failures.push(row.operation + ':incorrect');
    if (row.wallMs > budget.maxColdCliMs) failures.push(row.operation + ':latency');
    if (row.maxRssKiB > budget.maxRssKiB) failures.push(row.operation + ':memory');
  }
  if (classification) {
    if (classification.maxRssKiB > budget.maxRssKiB) failures.push('classification-memory');
    if (
      classification.processCode !== 0 ||
      classification.code !== 0 ||
      classification.rows?.length !== 4
    )
      failures.push('classification-incomplete');
    for (const row of classification.rows ?? []) {
      if (!row.correct) failures.push(row.name + ':classification-incorrect');
      if (row.p99Ms > budget.maxClassificationP99Ms)
        failures.push(row.name + ':classification-latency');
    }
  }
  if (baseline && !failures.some((failure) => failure.startsWith('baseline:'))) {
    for (const operation of ['list', 'set', 'read']) {
      const beforeRows = baseline.samples.filter((row) => row.operation === operation);
      const afterRows = samples.filter((row) => row.operation === operation);
      if (afterRows.length !== 3 || !afterRows.every(validTiming)) {
        failures.push(operation + ':comparison-incomplete');
        continue;
      }
      const before = quantile(
        beforeRows.map((row) => row.wallMs),
        0.5,
      );
      const after = quantile(
        afterRows.map((row) => row.wallMs),
        0.5,
      );
      if (after > before + budget.maxAddedMedianCliMs) failures.push(operation + ':added-latency');
    }
  }
  result.budget = { ...budget, failures };
  writeFileSync(output, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify({ output, failures, samples: samples.length }));
  if (failures.length) process.exitCode = 1;
}
