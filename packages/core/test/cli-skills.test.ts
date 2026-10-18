import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { TOB_CLI_PROMPT } from '../src/tob/service.js';

async function invoke(argv: string[], env: NodeJS.ProcessEnv = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });
  expect(stdout).toHaveLength(1);
  return { code, json: JSON.parse(stdout[0]!), stdout: stdout[0]!, stderr: stderr.join('') };
}

describe('installed CLI skills', () => {
  it('lists and reads packaged guidance without a Host or model, including scoped execution', async () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    for (const env of [
      {},
      { DEEPSEEKBOT_HOST: 'http://127.0.0.1:1' },
      { DEEPSEEKBOT_AGENT_ENDPOINT: 'unavailable', DEEPSEEKBOT_AGENT_TOKEN: 'private-token' },
    ]) {
      const result = await invoke(['skills', 'list'], env);
      expect(result.code).toBe(0);
      expect(result.json).toMatchObject({
        schemaVersion: 1,
        packageName: '@botharness/core',
        packageVersion: manifest.version,
        skills: [
          { id: 'bot-management', commands: ['capabilities', 'list', 'show'] },
          { id: 'avatar-management', commands: ['create', 'bot-avatar-set', 'group-avatar-set'] },
        ],
      });
      const detail = await invoke(['skills', 'show', 'avatar-management', '--compact'], env);
      expect(detail.code).toBe(0);
      expect(detail.stdout).not.toContain('\n');
      expect(detail.stderr).toBe('');
      expect(detail.json.packageVersion).toBe(manifest.version);
      expect(detail.json.skill.format).toBe('markdown');
      expect(detail.json.skill.body).toBe(
        readFileSync(new URL('../skills/avatar-management/SKILL.md', import.meta.url), 'utf8'),
      );
      expect(detail.stdout).not.toContain('private-token');
    }
  });

  it('refuses unknown IDs, arbitrary paths and unrelated options without opening a data owner', async () => {
    for (const id of ['missing', '../../package.json', '/etc/passwd']) {
      const result = await invoke(['skills', 'show', id]);
      expect(result.code).toBe(1);
      expect(result.json.error.code).toBe('unknown-skill');
    }
    for (const argv of [
      ['skills'],
      ['skills', 'list', 'extra'],
      ['skills', 'show'],
      ['skills', 'show', 'avatar-management', 'extra'],
      ['skills', 'list', '--home', '/unavailable'],
      ['skills', 'list', '--host', 'http://127.0.0.1:1'],
      ['skills', 'list', '--confirm'],
    ]) {
      const result = await invoke(argv);
      expect(result.code).toBe(2);
      expect(result.json.error.code).toBe('usage');
    }
  });

  it('points Tob to version-matched task guidance while retaining live capability discovery', () => {
    expect(TOB_CLI_PROMPT).toContain('deepseekbot skills list');
    expect(TOB_CLI_PROMPT).toContain('skills show avatar-management');
    expect(TOB_CLI_PROMPT).toContain('current capabilities discovery');
  });
});
