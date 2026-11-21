import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { writeZip } from '../src/bots/zip-archive.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { createModelPresetStore } from '../src/models/presets.js';
import { createTempRoot } from './helpers.js';
import { type Captured, baseEnv, invoke } from './bot-create-cli-fixture.js';

function git(args: string[], cwd: string, env: Record<string, string> = {}): void {
  execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });
}

function seedBareRepo(root: string): string {
  const work = join(root, 'work');
  mkdirSync(work, { recursive: true });
  git(['init', '-q', '-b', 'main'], work);
  mkdirSync(join(work, '.botharness'), { recursive: true });
  writeFileSync(
    join(work, '.botharness', 'bot.json'),
    JSON.stringify({ name: 'Seedling', tags: ['scout'], bio: 'grown from git' }),
  );
  writeFileSync(join(work, 'notes.md'), '# seed notes\n');
  git(['add', '-A'], work);
  git(
    [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'seed',
    ],
    work,
  );
  const bare = join(root, 'seed.git');
  git(['clone', '-q', '--bare', work, bare], root);
  return bare;
}

function withGitConfigEnv(bare: string, run: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  const rewrite = `${bare.replace(/seed\.git$/u, '')}`;
  const entries: Record<string, string> = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.${rewrite}.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://github.com/test/',
  };
  for (const [key, value] of Object.entries(entries)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

afterEach(() => {
  for (const key of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']) {
    delete process.env[key];
  }
});

describe('deepseekbot create', () => {
  it('prints help without touching a home', async () => {
    const out: string[] = [];
    const code = await runBotCreateCli(['--help'], {
      env: baseEnv(),
      stdout: (text) => out.push(text),
      stderr: () => {},
    });
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('tobs create --name <name>');
    expect(out.join('\n')).not.toContain('deepseekbot create');
  });

  it('prints help for engine without an action', async () => {
    const out: string[] = [];
    const code = await runBotCreateCli(['engine', '--help'], {
      env: baseEnv(),
      stdout: (text) => out.push(text),
      stderr: () => {},
    });
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('engine');
  });

  it('creates a blank bot against a fresh home with zero clicks', async () => {
    const home = createTempRoot('botharness-create-blank-');
    const result = await invoke(['create', '--name', 'Ada'], home);
    expect(result.code).toBe(0);
    expect(result.json.bot.id).toMatch(/^bot-[0-9a-f]{32}$/u);
    expect(result.json.bot.name).toBe('Ada');
    expect(result.json.dm.channelId).toBe(`dm-${result.json.bot.id}`);
    expect(result.json.dataDir).toBe(
      join(home, 'botharness', 'bots', result.json.bot.id, 'memory'),
    );
    expect(existsSync(result.json.dataDir)).toBe(true);
    expect(result.json.steps.map((step: { name: string }) => step.name)).toEqual([
      'validate',
      'allocate-id',
      'create-bot',
      'model',
    ]);
    expect(result.json.steps.at(-1)).toMatchObject({ status: 'deferred', code: 'no-model-yet' });
    expect(result.json.next).toHaveLength(3);
    expect(result.stderr).toContain(result.json.bot.id);
  });

  it('stores a blank bot Memory under a chosen absolute location', async () => {
    const home = createTempRoot('botharness-create-location-');
    const location = createTempRoot('botharness-create-location-target-');
    const result = await invoke(['create', '--name', 'Ada', '--memory-location', location], home);
    expect(result.code).toBe(0);
    expect(result.json.dataDir).toBe(join(location, result.json.bot.id));
    expect(existsSync(join(result.json.dataDir, '.git'))).toBe(true);
    const shown = await invoke(['show', result.json.bot.id], home);
    expect(shown.json.dataDir).toBe(join(location, result.json.bot.id));
  });

  it('refuses a relative or import-time Memory location as coded errors', async () => {
    const home = createTempRoot('botharness-create-location-bad-');
    const relative = await invoke(['create', '--name', 'Ada', '--memory-location', 'rel'], home);
    expect(relative.code).not.toBe(0);
    expect(relative.json.error.code).toBe('invalid-input');
    const imported = await invoke(
      ['create', '--name', 'Ada', '--from-git', 'owner/repo', '--memory-location', home],
      home,
    );
    expect(imported.code).toBe(2);
  });

  it('mints a second bot for a duplicate name', async () => {
    const home = createTempRoot('botharness-create-dup-');
    const first = await invoke(['create', '--name', 'Same'], home);
    const second = await invoke(['create', '--name', 'Same'], home);
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(second.json.bot.id).not.toBe(first.json.bot.id);
    const listed = await invoke(['list'], home);
    expect(listed.code).toBe(0);
    expect(listed.json.bots.map((bot: { id: string }) => bot.id).sort()).toEqual(
      [first.json.bot.id, second.json.bot.id].sort(),
    );
  });

  it('fails fast on a secret in argv and never echoes it', async () => {
    const home = createTempRoot('botharness-create-secret-argv-');
    for (const secret of ['--api-key', '--token=sk-fake-2']) {
      const result = await invoke(['create', '--name', 'Ada', secret, 'sk-fake-1'], home);
      expect(result.code).toBe(2);
      expect(result.json.error.code).toBe('secret-in-argv');
      expect(result.stdout).not.toContain('sk-fake');
    }
  });

  it('accepts secrets via env and keeps them out of stdout JSON', async () => {
    const home = createTempRoot('botharness-create-secret-env-');
    const result = await invoke(['create', '--name', 'Env Bot'], home, {
      DEEPSEEK_API_KEY: 'sk-env-secret-9',
    });
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('sk-env-secret-9');
  });

  it('reads the persona from stdin without echoing other env secrets', async () => {
    const home = createTempRoot('botharness-create-stdin-');
    const result = await invoke(
      ['create', '--name', 'Piped', '--persona-stdin'],
      home,
      {},
      'You are a scout.',
    );
    expect(result.code).toBe(0);
    expect(readFileSync(join(result.json.dataDir, 'SOUL.md'), 'utf8')).toBe('You are a scout.');
  });

  it('creates a blank bot with an Avatar file and Core Memory', async () => {
    const home = createTempRoot('botharness-create-avatar-');
    const avatar = join(home, 'tim.png');
    writeFileSync(
      avatar,
      Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('tiny')]),
    );
    const result = await invoke(
      ['create', '--name', 'Tim', '--avatar-file', avatar, '--core-memory', '# Core\n- Fridays'],
      home,
    );
    expect(result.code).toBe(0);
    expect(readFileSync(join(result.json.dataDir, 'MEMORY.md'), 'utf8')).toBe('# Core\n- Fridays');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    try {
      const registry = createPersonaBotRegistry({
        rootDir: join(home, 'botharness', 'bots'),
        database: owner,
      });
      expect(registry.get(result.json.bot.id)?.avatar).toMatch(/^data:image\/png;base64,/u);
    } finally {
      owner.close();
    }

    const piped = await invoke(
      ['create', '--name', 'Piped', '--core-memory-stdin'],
      home,
      {},
      '# Piped core',
    );
    expect(piped.code).toBe(0);
    expect(readFileSync(join(piped.json.dataDir, 'MEMORY.md'), 'utf8')).toBe('# Piped core');
  });

  it('refuses a bad or too-large Avatar file and conflicting stdin flags', async () => {
    const home = createTempRoot('botharness-create-avatar-bad-');
    const text = join(home, 'avatar.txt');
    writeFileSync(text, 'not an image');
    const large = join(home, 'large.png');
    writeFileSync(
      large,
      Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(200_000)]),
    );
    for (const file of [text, large]) {
      const refused = await invoke(['create', '--name', 'Tim', '--avatar-file', file], home);
      expect(refused.code).not.toBe(0);
      expect(refused.json.error.code).toBe('invalid-avatar');
    }
    const missing = await invoke(
      ['create', '--name', 'Tim', '--avatar-file', join(home, 'missing.png')],
      home,
    );
    expect(missing.json.error.code).toBe('file-unreadable');
    const both = await invoke(
      ['create', '--name', 'Tim', '--persona-stdin', '--core-memory-stdin'],
      home,
    );
    expect(both.code).toBe(2);
    const listed = await invoke(['list'], home);
    expect(JSON.stringify(listed.json)).not.toContain('"Tim"');
  });

  it('rejects a missing name and mixed sources as usage errors', async () => {
    const home = createTempRoot('botharness-create-usage-');
    const missing = await invoke(['create'], home);
    expect(missing.code).toBe(2);
    expect(missing.json.error.code).toBe('usage');
    const mixed = await invoke(
      ['create', '--name', 'Ada', '--from-zip', 'a.zip', '--from-git', 'o/r'],
      home,
    );
    expect(mixed.code).toBe(2);
    expect(mixed.json.error.code).toBe('usage');
  });

  it('refuses a damaged zip and a missing zip with bad-zip', async () => {
    const home = createTempRoot('botharness-create-badzip-');
    const damaged = join(home, 'damaged.zip');
    writeFileSync(damaged, 'not a zip at all');
    const first = await invoke(['create', '--from-zip', damaged], home);
    expect(first.code).toBe(1);
    expect(first.json.error.code).toBe('bad-zip');
    const missing = await invoke(['create', '--from-zip', join(home, 'absent.zip')], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('bad-zip');
  });

  it('imports a bot bundle zip and honors an explicit name override', async () => {
    const home = createTempRoot('botharness-create-zip-');
    const archive = join(home, 'bot.zip');
    writeFileSync(
      archive,
      writeZip([
        {
          path: '.botharness/bot.json',
          data: Buffer.from(JSON.stringify({ name: 'Zippy', tags: ['scout'], bio: 'from zip' })),
        },
        { path: 'notes.md', data: Buffer.from('# memory\n') },
      ]),
    );
    const imported = await invoke(['create', '--from-zip', archive], home);
    expect(imported.code).toBe(0);
    expect(imported.json.bot.name).toBe('Zippy');
    expect(existsSync(join(imported.json.dataDir, 'notes.md'))).toBe(true);
    const renamed = await invoke(['create', '--name', 'Override', '--from-zip', archive], home);
    expect(renamed.code).toBe(0);
    expect(renamed.json.bot.name).toBe('Override');
  });

  it('imports a bot bundle directory and rejects an empty one', async () => {
    const home = createTempRoot('botharness-create-dir-');
    const bundle = join(home, 'bundle');
    mkdirSync(join(bundle, '.botharness'), { recursive: true });
    writeFileSync(
      join(bundle, '.botharness', 'bot.json'),
      JSON.stringify({ name: 'Dirling', tags: ['scout'] }),
    );
    writeFileSync(join(bundle, 'notes.md'), '# memory\n');
    const imported = await invoke(['create', '--from-dir', bundle], home);
    expect(imported.code).toBe(0);
    expect(imported.json.bot.name).toBe('Dirling');
    const empty = join(home, 'empty');
    mkdirSync(empty, { recursive: true });
    const refused = await invoke(['create', '--from-dir', empty], home);
    expect(refused.code).toBe(1);
    expect(refused.json.error.code).toBe('bad-bundle');
  });

  it('rejects a malformed git ref without touching the network', async () => {
    const home = createTempRoot('botharness-create-badref-');
    const result = await invoke(['create', '--name', 'Ada', '--from-git', 'not a url!!!'], home);
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('bad-ref');
  });

  it('reports an unreachable git remote with a coded error', async () => {
    const home = createTempRoot('botharness-create-unreachable-');
    const result = await invoke(
      ['create', '--name', 'Ada', '--from-git', 'https://127.0.0.1:9/nope.git'],
      home,
    );
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('git-clone-failed');
  });

  it('clones a GitHub shorthand ref through a local rewrite', async () => {
    const home = createTempRoot('botharness-create-git-');
    const root = createTempRoot('botharness-create-seed-');
    const bare = seedBareRepo(root);
    void bare;
    let result: Captured | undefined;
    await withGitConfigEnv(join(root, 'seed.git'), async () => {
      result = await invoke(['create', '--name', 'GitBot', '--from-git', 'test/seed'], home);
    });
    expect(result?.code).toBe(0);
    expect(result?.json.bot.name).toBe('GitBot');
    expect(existsSync(join(result?.json.dataDir as string, 'notes.md'))).toBe(true);
  });

  it('applies a model preset and reports an unknown preset without minting', async () => {
    const home = createTempRoot('botharness-create-preset-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let presetId = '';
    try {
      const presets = createModelPresetStore({
        rootDir: join(home, 'botharness'),
        database: owner,
      });
      presetId = presets.create({
        name: 'Scout',
        orchestrator: { provider: 'deepseek', model: 'deepseek-chat' },
        assignmentDefault: { provider: 'deepseek', model: 'deepseek-chat' },
      }).id;
    } finally {
      owner.close();
    }
    const applied = await invoke(['create', '--name', 'Preset Bot', '--preset', presetId], home);
    expect(applied.code).toBe(0);
    expect(applied.json.steps.at(-1)).toMatchObject({ name: 'model', status: 'ok' });
    const unknown = await invoke(['create', '--name', 'Nope', '--preset', 'absent'], home);
    expect(unknown.code).toBe(1);
    expect(unknown.json.error.code).toBe('unknown-preset');
    const listed = await invoke(['list'], home);
    expect(listed.json.bots.map((bot: { name: string }) => bot.name)).toEqual(['Preset Bot']);
  });

  it('shows a bot and reports an unknown id', async () => {
    const home = createTempRoot('botharness-create-show-');
    const created = await invoke(['create', '--name', 'Ada'], home);
    const shown = await invoke(['show', created.json.bot.id], home);
    expect(shown.code).toBe(0);
    expect(shown.json.bot).toMatchObject({ id: created.json.bot.id, name: 'Ada' });
    expect(shown.json.dm.channelId).toBe(`dm-${created.json.bot.id}`);
    expect(shown.json.dataDir).toBe(created.json.dataDir);
    const missing = await invoke(['show', 'bot-absent'], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('unknown-bot');
  });
});

describe('deepseekbot model', () => {
  const routes = [
    '--orchestrator-provider',
    'deepseek',
    '--orchestrator-model',
    'deepseek-chat',
    '--assignment-provider',
    'deepseek',
    '--assignment-model',
    'deepseek-chat',
  ];

  it('lists presets, creates one, and applies it to a bot', async () => {
    const home = createTempRoot('botharness-model-');
    const empty = await invoke(['model-presets'], home);
    expect(empty.code).toBe(0);
    expect(empty.json).toEqual({ presets: [] });
    const created = await invoke(['model-preset-create', '--name', 'Scout', ...routes], home);
    expect(created.code).toBe(0);
    expect(created.json.preset).toMatchObject({
      name: 'Scout',
      orchestrator: { provider: 'deepseek', model: 'deepseek-chat' },
      assignmentDefault: { provider: 'deepseek', model: 'deepseek-chat' },
    });
    const listed = await invoke(['model-presets'], home);
    expect(listed.json.presets.map((preset: { id: string }) => preset.id)).toEqual([
      created.json.preset.id,
    ]);
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const applied = await invoke(
      ['model-preset-apply', bot.json.bot.id, '--preset', created.json.preset.id],
      home,
    );
    expect(applied.code).toBe(0);
    expect(applied.json.plan).toMatchObject({
      sourcePresetId: created.json.preset.id,
      revision: 1,
    });
    const plan = await invoke(['model-plan', bot.json.bot.id], home);
    expect(plan.code).toBe(0);
    expect(plan.json.plan.sourcePresetId).toBe(created.json.preset.id);
    expect(plan.json.revision).toBe(1);
    expect(plan.json.readiness).toMatchObject({ status: 'deferred', code: 'host-only' });
  });

  it('reports a bare bot plan as empty with deferred readiness', async () => {
    const home = createTempRoot('botharness-model-bare-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const plan = await invoke(['model-plan', bot.json.bot.id], home);
    expect(plan.code).toBe(0);
    expect(plan.json.plan).toBeNull();
    expect(plan.json.revision).toBe(0);
  });

  it('rejects duplicate preset names, unknown presets, and unknown bots', async () => {
    const home = createTempRoot('botharness-model-errors-');
    const first = await invoke(['model-preset-create', '--name', 'Scout', ...routes], home);
    expect(first.code).toBe(0);
    const duplicate = await invoke(['model-preset-create', '--name', 'scout', ...routes], home);
    expect(duplicate.code).toBe(1);
    expect(duplicate.json.error.code).toBe('duplicate-preset');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const unknownPreset = await invoke(
      ['model-preset-apply', bot.json.bot.id, '--preset', 'absent'],
      home,
    );
    expect(unknownPreset.code).toBe(1);
    expect(unknownPreset.json.error.code).toBe('unknown-preset');
    const unknownBot = await invoke(
      ['model-preset-apply', 'bot-absent', '--preset', first.json.preset.id],
      home,
    );
    expect(unknownBot.code).toBe(1);
    expect(unknownBot.json.error.code).toBe('unknown-bot');
    const unknownPlan = await invoke(['model-plan', 'bot-absent'], home);
    expect(unknownPlan.code).toBe(1);
    expect(unknownPlan.json.error.code).toBe('unknown-bot');
  });

  it('requires routes and ids as usage errors', async () => {
    const home = createTempRoot('botharness-model-usage-');
    const missing = await invoke(['model-preset-create', '--name', 'Scout'], home);
    expect(missing.code).toBe(2);
    expect(missing.json.error.code).toBe('usage');
    const noId = await invoke(['model-preset-apply', '--preset', 'x'], home);
    expect(noId.code).toBe(2);
    expect(noId.json.error.code).toBe('usage');
  });

  it('rejects unknown providers before writing anything', async () => {
    const home = createTempRoot('botharness-model-provider-');
    const bad = await invoke(
      [
        'model-preset-create',
        '--name',
        'Bogus',
        '--orchestrator-provider',
        'nope',
        '--orchestrator-model',
        'x',
        '--assignment-provider',
        'deepseek',
        '--assignment-model',
        'deepseek-chat',
      ],
      home,
    );
    expect(bad.code).toBe(1);
    expect(bad.json.error.code).toBe('invalid-input');
    expect(bad.json.error.message).toContain('nope');
    const listed = await invoke(['model-presets'], home);
    expect(listed.json).toEqual({ presets: [] });
  });

  it('accepts Host-declared provider routes alongside catalog providers', async () => {
    const home = createTempRoot('botharness-model-host-routes-');
    for (const provider of ['deepseek-official', 'deepseek-account']) {
      const created = await invoke(
        [
          'model-preset-create',
          '--name',
          `Host ${provider}`,
          '--orchestrator-provider',
          provider,
          '--orchestrator-model',
          'x',
          '--assignment-provider',
          provider,
          '--assignment-model',
          'x',
        ],
        home,
      );
      expect(created.code).toBe(0);
    }
  });

  it('refuses to apply a preset with an unknown provider and leaves the bot untouched', async () => {
    const home = createTempRoot('botharness-model-apply-provider-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let presetId = '';
    try {
      presetId = createModelPresetStore({
        rootDir: join(home, 'botharness'),
        database: owner,
      }).create({
        name: 'Bogus',
        orchestrator: { provider: 'nope', model: 'x' },
        assignmentDefault: { provider: 'deepseek', model: 'deepseek-chat' },
      }).id;
    } finally {
      owner.close();
    }
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const applied = await invoke(
      ['model-preset-apply', bot.json.bot.id, '--preset', presetId],
      home,
    );
    expect(applied.code).toBe(1);
    expect(applied.json.error.code).toBe('invalid-input');
    const plan = await invoke(['model-plan', bot.json.bot.id], home);
    expect(plan.json.plan).toBeNull();
    expect(plan.json.revision).toBe(0);
  });

  it('mints nothing when create-time preset has an unknown provider', async () => {
    const home = createTempRoot('botharness-model-create-provider-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let presetId = '';
    try {
      presetId = createModelPresetStore({
        rootDir: join(home, 'botharness'),
        database: owner,
      }).create({
        name: 'Bogus',
        orchestrator: { provider: 'deepseek', model: 'deepseek-chat' },
        assignmentDefault: { provider: 'nope', model: 'x' },
      }).id;
    } finally {
      owner.close();
    }
    const result = await invoke(['create', '--name', 'Ada', '--preset', presetId], home);
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('invalid-input');
    expect(result.json.bot).toBeUndefined();
    const listed = await invoke(['list'], home);
    expect(listed.json).toEqual({ bots: [] });
  });

  it('refuses secret argv on model verbs and keeps env secrets out of stdout', async () => {
    const home = createTempRoot('botharness-model-secret-');
    const refused = await invoke(['model-presets', '--token', 'sk-fake-7'], home);
    expect(refused.code).toBe(2);
    expect(refused.json.error.code).toBe('secret-in-argv');
    expect(refused.stdout).not.toContain('sk-fake-7');
    const result = await invoke(['model-presets'], home, { DEEPSEEK_API_KEY: 'sk-env-secret-7' });
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('sk-env-secret-7');
  });
});
