import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  imTestAppsPath,
  listImTestApps,
  loadImTestApp,
  loadSlackImTestApp,
  listSlackImTestApps,
  loadDiscordImTestApp,
  listDiscordImTestApps,
  saveImTestAppValues,
} from '../dev-im-test-apps.mjs';

const directories = [];
function fixture(text) {
  const directory = mkdtempSync(join(tmpdir(), 'bh-shared-im-'));
  directories.push(directory);
  const path = join(directory, 'im-test-apps.env');
  writeFileSync(path, text, { mode: 0o600 });
  return { path };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const configuration = [
  'BH_IM_QA_SLOT=QA1',
  'BH_LARK_QA1_NAME=BotHarness reusable QA 1',
  'BH_LARK_QA1_DOMAIN=lark',
  'BH_LARK_QA1_APP_ID=cli_test_one',
  'BH_LARK_QA1_APP_SECRET=test-secret-one',
  'BH_LARK_QA1_CONSOLE_READY=yes',
  'BH_LARK_QA1_RECEIVER_CHECKED_AT=2026-10-10T10:00:00Z',
  'BH_LARK_QA2_NAME=BotHarness reusable QA 2',
  'BH_LARK_QA2_DOMAIN=lark',
  'BH_LARK_QA2_APP_ID=cli_test_two',
  'BH_LARK_QA2_APP_SECRET=test-secret-two',
].join('\n');

const slackConfiguration = [
  'BH_SLACK_QA_SLOT=QA2',
  'BH_SLACK_QA1_NAME=BotHarness Slack QA',
  'BH_SLACK_QA1_WORKSPACE_NAME=QA Workspace One',
  'BH_SLACK_QA1_WORKSPACE_URL=https://qa-one.slack.com',
  'BH_SLACK_QA1_APP_ID=AQAONE',
  'BH_SLACK_QA1_BOT_TOKEN=xoxb-synthetic-bot-token-one',
  'BH_SLACK_QA1_APP_TOKEN=xapp-synthetic-app-token-one',
  'BH_SLACK_QA1_CONSOLE_READY=yes',
  'BH_SLACK_QA1_RECEIVER_CHECKED_AT=2026-10-11T17:20:00Z',
  'BH_SLACK_QA2_NAME=BotHarness Slack QA Two',
  'BH_SLACK_QA2_WORKSPACE_NAME=QA Workspace Two',
  'BH_SLACK_QA2_WORKSPACE_URL=https://qa-two.slack.com',
  'BH_SLACK_QA2_APP_ID=AQATWO',
  'BH_SLACK_QA2_BOT_TOKEN=xoxb-synthetic-bot-token-two',
  'BH_SLACK_QA2_APP_TOKEN=xapp-synthetic-app-token-two',
].join('\n');

const discordConfiguration = [
  'BH_DISCORD_QA_SLOT=QA1',
  'BH_DISCORD_QA1_NAME=Synthetic Discord QA One',
  'BH_DISCORD_QA1_APP_ID=1557410346271244380',
  'BH_DISCORD_QA1_GUILD_NAME=QA server one',
  'BH_DISCORD_QA1_GUILD_ID=1557412878687014925',
  'BH_DISCORD_QA1_CHANNEL_NAME=QA channel one',
  'BH_DISCORD_QA1_CHANNEL_ID=1557412879853035562',
  'BH_DISCORD_QA1_BOT_TOKEN=SYNTHETIC.DISCORD.TOKEN-one',
  'BH_DISCORD_QA1_CONSOLE_READY=yes',
  'BH_DISCORD_QA1_RECEIVER_CHECKED_AT=2026-10-14T00:00:00Z',
  'BH_DISCORD_QA2_NAME=Synthetic Discord QA Two',
  'BH_DISCORD_QA2_APP_ID=1557410346271244381',
  'BH_DISCORD_QA2_GUILD_NAME=QA server two',
  'BH_DISCORD_QA2_GUILD_ID=1557412878687014926',
  'BH_DISCORD_QA2_CHANNEL_NAME=QA channel two',
  'BH_DISCORD_QA2_CHANNEL_ID=1557412879853035563',
  'BH_DISCORD_QA2_BOT_TOKEN=SYNTHETIC.DISCORD.TOKEN-two',
].join('\n');

describe('machine-local reusable IM test Apps', () => {
  it('loads independent Discord slots and preserves Lark, Slack and literal metadata on updates', () => {
    const options = fixture(configuration);
    saveImTestAppValues(slackConfiguration, options);
    const larkBefore = loadImTestApp(undefined, options);
    const slackBefore = loadSlackImTestApp(undefined, options);
    saveImTestAppValues(discordConfiguration, options);
    expect(loadDiscordImTestApp(undefined, options)).toMatchObject({
      slot: 'QA1',
      appId: '1557410346271244380',
      guildId: '1557412878687014925',
      channelId: '1557412879853035562',
      botToken: 'SYNTHETIC.DISCORD.TOKEN-one',
      consoleReady: true,
    });
    expect(loadDiscordImTestApp('QA2', options)).toMatchObject({
      name: 'Synthetic Discord QA Two',
      botToken: 'SYNTHETIC.DISCORD.TOKEN-two',
      consoleReady: false,
    });
    expect(() => loadDiscordImTestApp('QA3', options)).toThrow('incomplete');
    expect(loadImTestApp(undefined, options)).toEqual(larkBefore);
    expect(loadSlackImTestApp(undefined, options)).toEqual(slackBefore);
    const discordBefore = loadDiscordImTestApp('QA1', options);
    saveImTestAppValues('BH_LARK_QA2_NAME=Renamed Lark', options);
    saveImTestAppValues('BH_SLACK_QA2_NAME=Renamed Slack', options);
    expect(loadDiscordImTestApp('QA1', options)).toEqual(discordBefore);
    saveImTestAppValues('BH_DISCORD_QA2_NAME=Discord $(exit 99) = literal', options);
    expect(loadDiscordImTestApp('QA2', options).name).toBe('Discord $(exit 99) = literal');
    const stored = readFileSync(options.path, 'utf8');
    expect(stored).toContain('# BH_DISCORD_QA1_BOT_TOKEN=SYNTHETIC.DISCORD.TOKEN-one');
    expect(stored).not.toMatch(/^BH_DISCORD_/mu);
    expect(
      stored.split('\n').filter((line) => line.startsWith('# BH_DISCORD_QA2_NAME=')),
    ).toHaveLength(1);
  });

  it('refuses invalid Discord IDs, prefixed tokens and duplicate keys without exposing values', () => {
    for (const text of [
      discordConfiguration.replace('1557410346271244380', 'application-name'),
      discordConfiguration.replace('1557410346271244380', '18446744073709551616'),
      discordConfiguration.replace(
        '1557412878687014925',
        'https://discord.com/channels/1557412878687014925',
      ),
      discordConfiguration.replace('1557412879853035562', '1557412879853035600.1'),
      discordConfiguration.replace(
        'SYNTHETIC.DISCORD.TOKEN-one',
        'Bot SYNTHETIC.DISCORD.TOKEN-one',
      ),
      discordConfiguration.replace('SYNTHETIC.DISCORD.TOKEN-one', '$(exit 99)'),
    ]) {
      expect(() => loadDiscordImTestApp('QA1', fixture(text))).toThrow(
        'Discord test slot QA1 is incomplete; run setup discord',
      );
    }
    const options = fixture(configuration);
    expect(() =>
      saveImTestAppValues('BH_DISCORD_QA_SLOT=QA1\n# BH_DISCORD_QA_SLOT=QA2', options),
    ).toThrow('Duplicate');
    expect(readFileSync(options.path, 'utf8')).toBe(configuration);
  });

  it('Discord CLI lists no Token or IDs and never turns an old check into a receiver lease', () => {
    const options = fixture(configuration);
    saveImTestAppValues(discordConfiguration, options);
    const result = spawnSync(
      process.execPath,
      ['scripts/dev-im-test-apps.mjs', 'list', 'discord'],
      {
        encoding: 'utf8',
        timeout: 15_000,
        env: { ...process.env, BOTHARNESS_IM_TEST_APPS_ENV: options.path },
      },
    );
    expect(result.status).toBe(0);
    const listed = JSON.parse(result.stdout).apps;
    expect(listed).toEqual(listDiscordImTestApps(options));
    expect(listed[0]).toMatchObject({
      credentialsConfigured: true,
      consoleReady: true,
      guildName: 'QA server one',
      receiverAvailability: 'requires-current-window-confirmation',
    });
    expect(listed[2]).toMatchObject({ name: null, credentialsConfigured: false });
    for (const value of [
      'SYNTHETIC.DISCORD',
      '1557410346271244380',
      '1557412878687014925',
      '1557412879853035562',
      'test-secret',
      'xoxb-',
    ]) {
      expect(result.stdout).not.toContain(value);
      expect(result.stderr).not.toContain(value);
    }
  });

  it('keeps the wizard library unchanged and opens the correct Discord pages before hidden input', () => {
    const template = readFileSync('.agents/skills/wizard/template.sh', 'utf8');
    const wizard = readFileSync('scripts/setup-discord-test-app.sh', 'utf8');
    expect(wizard.startsWith(template.slice(0, template.indexOf('TOTAL_STAGES=1')))).toBe(true);
    expect(wizard).toContain('TOTAL_STAGES=3');
    expect(
      wizard.indexOf('open_url "https://discord.com/developers/applications/${!id_key}/bot"'),
    ).toBeLessThan(wizard.indexOf('ask_secret "${prefix}_BOT_TOKEN"'));
    expect(wizard.slice(template.indexOf('TOTAL_STAGES=1'))).not.toMatch(
      /\bset_secret\b|\bset_var\b/,
    );
  });

  it('captures synthetic Discord input without echo, preserves other slots and retains Token on Enter', () => {
    const options = fixture(configuration);
    saveImTestAppValues(slackConfiguration, options);
    saveImTestAppValues(discordConfiguration.replace('QA channel two', '常规'), options);
    const larkBefore = loadImTestApp(undefined, options);
    const slackBefore = loadSlackImTestApp(undefined, options);
    const discordBefore = loadDiscordImTestApp('QA1', options);
    const token = 'SYNTHETIC.DISCORD.SECRET-qa2-new';
    const run = (input) =>
      spawnSync(
        process.execPath,
        ['scripts/dev-im-test-apps.mjs', 'setup', 'discord', '--manual'],
        {
          input,
          encoding: 'utf8',
          timeout: 15_000,
          env: {
            ...process.env,
            BOTHARNESS_IM_TEST_APPS_ENV: options.path,
            BOTHARNESS_IM_TEST_APPS_NO_OPEN: '1',
          },
        },
      );
    const result = run(['', 'QA2', '', '', 'y', token, '', '', '', '', 'y', ''].join('\n'));
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'https://discord.com/developers/applications/1557410346271244381/bot',
    );
    expect(result.stdout).toContain(
      'https://discord.com/channels/1557412878687014926/1557412879853035563',
    );
    expect(result.stdout).not.toContain(token);
    expect(result.stderr).not.toContain(token);
    expect(loadDiscordImTestApp(undefined, options)).toMatchObject({
      slot: 'QA2',
      botToken: token,
      consoleReady: true,
    });
    const repeated = run(['', '', '', '', 'y', '', '', '', '', '', 'n', ''].join('\n'));
    expect(repeated.status).toBe(0);
    expect(repeated.stdout).not.toContain(token);
    expect(repeated.stderr).not.toContain(token);
    expect(loadDiscordImTestApp('QA2', options)).toMatchObject({
      botToken: token,
      consoleReady: false,
    });
    expect(loadImTestApp(undefined, options)).toEqual(larkBefore);
    expect(loadSlackImTestApp(undefined, options)).toEqual(slackBefore);
    expect(loadDiscordImTestApp('QA1', options)).toEqual(discordBefore);
  });

  it('asks only for the Token when an agent has prepared Discord metadata, including Chinese names', () => {
    const options = fixture(configuration);
    saveImTestAppValues(slackConfiguration, options);
    saveImTestAppValues(discordConfiguration.replace('QA channel one', '常规'), options);
    const before = loadDiscordImTestApp('QA1', options);
    const token = 'SYNTHETIC.DISCORD.NEW-token';
    const result = spawnSync(
      process.execPath,
      ['scripts/dev-im-test-apps.mjs', 'setup', 'discord'],
      {
        input: `${token}\n`,
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          BOTHARNESS_IM_TEST_APPS_ENV: options.path,
          BOTHARNESS_IM_TEST_APPS_NO_OPEN: '1',
        },
      },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('常规');
    expect(result.stdout).toContain('Bot Token');
    for (const forbidden of [
      'Ready to start?',
      '测试槽 [',
      'App 名称:',
      '测试服务器名称:',
      '测试服务器 ID:',
      '测试文字频道名称:',
      '测试文字频道 ID',
      token,
    ]) {
      expect(result.stdout).not.toContain(forbidden);
      expect(result.stderr).not.toContain(forbidden);
    }
    expect(loadDiscordImTestApp('QA1', options)).toEqual({
      ...before,
      botToken: token,
      consoleReady: false,
    });
    expect(loadImTestApp(undefined, options)).toMatchObject({ name: 'BotHarness reusable QA 1' });
    expect(loadSlackImTestApp(undefined, options)).toMatchObject({
      name: 'BotHarness Slack QA Two',
    });
  });

  it('refuses a Token-only handoff with missing metadata before asking for or saving a Token', () => {
    const options = fixture(configuration);
    const before = readFileSync(options.path, 'utf8');
    const result = spawnSync(
      process.execPath,
      ['scripts/dev-im-test-apps.mjs', 'setup', 'discord', 'QA3'],
      {
        input: 'SYNTHETIC.NOT-TO-BE-SAVED\n',
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          BOTHARNESS_IM_TEST_APPS_ENV: options.path,
          BOTHARNESS_IM_TEST_APPS_NO_OPEN: '1',
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('Bot Token（隐藏输入）:');
    expect(result.stdout).not.toContain('SYNTHETIC.NOT-TO-BE-SAVED');
    expect(readFileSync(options.path, 'utf8')).toBe(before);
  });

  it('atomically saves one stage while preserving other Apps, comments and literal values', () => {
    const options = fixture('# private machine-local configuration\n' + configuration);
    const before = loadImTestApp('QA1', options);
    saveImTestAppValues(
      'BH_LARK_QA2_NAME=QA2 $(exit 99) = literal\nBH_LARK_QA2_CONSOLE_READY=yes\n',
      options,
    );
    expect(loadImTestApp('QA1', options)).toEqual(before);
    expect(loadImTestApp('QA2', options)).toMatchObject({
      name: 'QA2 $(exit 99) = literal',
      consoleReady: true,
    });
    expect(readFileSync(options.path, 'utf8')).toContain('# private machine-local configuration');
    expect(readdirSync(directories.at(-1))).toEqual(['im-test-apps.env']);
    if (process.platform !== 'win32') expect(statSync(options.path).mode & 0o077).toBe(0);
  });

  it('refuses malformed or duplicate updates before changing the existing configuration', () => {
    const options = fixture(configuration);
    for (const text of ['', 'UNKNOWN_KEY=value', 'BH_IM_QA_SLOT=QA1\nBH_IM_QA_SLOT=QA2']) {
      expect(() => saveImTestAppValues(text, options)).toThrow();
      expect(readFileSync(options.path, 'utf8')).toBe(configuration);
    }
  });

  it('runs actual setup with synthetic stdin and preserves QA1 without echoing the new secret', () => {
    const options = fixture(configuration);
    const result = spawnSync(process.execPath, ['scripts/dev-im-test-apps.mjs', 'setup'], {
      input: '\nQA2\nSynthetic QA2\ny\ncli_synthetic_two\nSYNTHETIC-WIZARD-SECRET\nn\n',
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, BOTHARNESS_IM_TEST_APPS_ENV: options.path },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('https://open.larksuite.com/app');
    expect(result.stdout).not.toContain('SYNTHETIC-WIZARD-SECRET');
    expect(result.stderr).not.toContain('SYNTHETIC-WIZARD-SECRET');
    expect(loadImTestApp('QA1', options)).toEqual(loadImTestApp('QA1', fixture(configuration)));
    expect(loadImTestApp('QA2', options)).toMatchObject({
      appId: 'cli_synthetic_two',
      appSecret: 'SYNTHETIC-WIZARD-SECRET',
      consoleReady: false,
    });
  });

  it('shares Slack slots independently while preserving Lark data and legacy-readable comments', () => {
    const options = fixture(configuration);
    const larkBefore = loadImTestApp(undefined, options);
    saveImTestAppValues(slackConfiguration, options);
    expect(loadImTestApp(undefined, options)).toEqual(larkBefore);
    expect(loadSlackImTestApp(undefined, options)).toMatchObject({
      slot: 'QA2',
      name: 'BotHarness Slack QA Two',
      workspaceUrl: 'https://qa-two.slack.com',
      botToken: 'xoxb-synthetic-bot-token-two',
      appToken: 'xapp-synthetic-app-token-two',
      consoleReady: false,
    });
    expect(loadSlackImTestApp('QA1', options)).toMatchObject({
      name: 'BotHarness Slack QA',
      appId: 'AQAONE',
      consoleReady: true,
    });
    const stored = readFileSync(options.path, 'utf8');
    expect(stored).toContain('# BH_SLACK_QA2_BOT_TOKEN=xoxb-synthetic-bot-token-two');
    expect(stored).not.toMatch(/^BH_SLACK_/mu);
    const slackBefore = loadSlackImTestApp('QA1', options);
    saveImTestAppValues('BH_LARK_QA1_CONSOLE_READY=pending', options);
    expect(loadSlackImTestApp('QA1', options)).toEqual(slackBefore);
    saveImTestAppValues('BH_SLACK_QA2_NAME=Slack $(exit 99) = literal', options);
    expect(loadSlackImTestApp('QA2', options).name).toBe('Slack $(exit 99) = literal');
    expect(() => loadSlackImTestApp('QA3', options)).toThrow('incomplete');
  });

  it('refuses swapped tokens, unsafe metadata and duplicate Slack keys without exposing values', () => {
    for (const text of [
      slackConfiguration.replace('xoxb-synthetic-bot-token-one', 'xapp-synthetic-bot-token-one'),
      slackConfiguration.replace('xapp-synthetic-app-token-one', 'xoxb-synthetic-app-token-one'),
      slackConfiguration.replace(
        'https://qa-one.slack.com',
        'https://qa-one.slack.com/?token=private',
      ),
      slackConfiguration.replace('https://qa-one.slack.com', 'https://user@qa-one.slack.com'),
      slackConfiguration.replace('AQAONE', 'display-name'),
    ]) {
      expect(() => loadSlackImTestApp('QA1', fixture(text))).toThrow(
        'Slack test slot QA1 is incomplete; run setup slack',
      );
    }
    const options = fixture(configuration);
    expect(() =>
      saveImTestAppValues('BH_SLACK_QA_SLOT=QA1\n# BH_SLACK_QA_SLOT=QA2', options),
    ).toThrow('Duplicate');
    expect(readFileSync(options.path, 'utf8')).toBe(configuration);
  });

  it('Slack CLI lists only metadata from the shared file, with no credential or idle claim', () => {
    const options = fixture(configuration);
    saveImTestAppValues(slackConfiguration, options);
    const result = spawnSync(process.execPath, ['scripts/dev-im-test-apps.mjs', 'list', 'slack'], {
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, BOTHARNESS_IM_TEST_APPS_ENV: options.path },
    });
    expect(result.status).toBe(0);
    const listed = JSON.parse(result.stdout).apps;
    expect(listed).toEqual(listSlackImTestApps(options));
    expect(listed[0]).toMatchObject({
      name: 'BotHarness Slack QA',
      workspaceName: 'QA Workspace One',
      credentialsConfigured: true,
      receiverAvailability: 'requires-current-window-confirmation',
    });
    expect(listed[2]).toMatchObject({ name: null, credentialsConfigured: false });
    for (const value of ['xoxb-', 'xapp-', 'AQAONE', 'test-secret', 'cli_test']) {
      expect(result.stdout).not.toContain(value);
      expect(result.stderr).not.toContain(value);
    }
  });

  it('uses a fixed user path independent of the repository and allows an explicit cross-OS file', () => {
    expect(imTestAppsPath({})).toMatch(/[\\/]\.config[\\/]botharness[\\/]im-test-apps\.env$/u);
    const file = fixture(configuration).path;
    expect(imTestAppsPath({ BOTHARNESS_IM_TEST_APPS_ENV: file })).toBe(file);
  });

  it('loads the selected slot without mixing two Apps and preserves names with spaces', () => {
    const options = fixture(configuration);
    expect(loadImTestApp(undefined, options)).toMatchObject({
      slot: 'QA1',
      name: 'BotHarness reusable QA 1',
      appId: 'cli_test_one',
      appSecret: 'test-secret-one',
      consoleReady: true,
    });
    expect(loadImTestApp('QA2', options)).toMatchObject({
      appId: 'cli_test_two',
      appSecret: 'test-secret-two',
      consoleReady: false,
    });
    expect(() => loadImTestApp('QA3', options)).toThrow('incomplete');
  });

  it('lists only non-secret metadata and never treats a prior window as an idle receiver', () => {
    const listed = listImTestApps(fixture(configuration));
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain('test-secret');
    expect(serialized).not.toContain('cli_test');
    expect(listed[0]).toMatchObject({
      credentialsConfigured: true,
      receiverAvailability: 'requires-current-window-confirmation',
    });
    expect(listed[2]).toMatchObject({ name: null, credentialsConfigured: false });
  });

  it('parses literal values rather than executing shell text or substituting variables', () => {
    const options = fixture(
      configuration.replace('BotHarness reusable QA 1', '$(exit 99) ${HOME}'),
    );
    expect(loadImTestApp('QA1', options).name).toBe('$(exit 99) ${HOME}');
    expect(() =>
      loadImTestApp('QA1', fixture(configuration.replace('test-secret-one', '$(exit 99)'))),
    ).toThrow('incomplete');
    expect(() => listImTestApps(fixture(`${configuration}\nBH_IM_QA_SLOT=QA2`))).toThrow(
      'Duplicate',
    );
  });
});
