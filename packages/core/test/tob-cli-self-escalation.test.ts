import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTobCliBroker, type TobCliBroker } from '../src/tob/cli-broker.js';
import {
  authorizeTobHostCli,
  classifyTobHostCli,
  createTobHostCliOperations,
} from '../src/tob/cli-host-commands.js';
import { humanContext } from '../src/humans/context.js';

const brokers: TobCliBroker[] = [];
afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
});

const deps = {
  registry: { getHistorical: () => undefined },
  channels: { get: () => undefined },
  human: humanContext('owner'),
  isTob: (slug: string) => slug === 'tob',
};

async function broker() {
  const run = vi.fn(async () => ({ exitCode: 0, stdout: '{"ok":true}' }));
  const approve = vi.fn(async (_proposal: unknown) => {});
  const started = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize: () => {},
    approve,
    readSetting: () => ({ scope: 'global', value: 1, revision: 1 }),
    writeSetting: async () => ({ scope: 'global', value: 1, revision: 1 }),
    prepareOperation: createTobHostCliOperations({
      run,
      authorize: (argv) => authorizeTobHostCli(argv, deps),
    }),
    capabilities: [],
  });
  brokers.push(started);
  const invoke = async (argv: string[]) => {
    const response = await fetch(started.endpoint + '/invoke', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + started.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ command: 'cli', args: { argv } }),
    });
    return (await response.json()) as {
      ok: boolean;
      error?: { code: string; message: string };
    };
  };
  return { invoke, run, approve };
}

describe('Tob grant, approval policy and Browser commands', () => {
  it.each([
    ['approval-template-set', 'tob', 'full-access'],
    ['grant-create', 'tob', '--workspace', 'ws-1'],
    ['grant-write-set', 'tob', '--grant', 'g-1', '--enabled'],
    ['browser-access-set', 'tob', '--enabled'],
    ['computer-access-set', 'tob', '--enabled'],
    ['bot-mode-set', 'tob', '--mode', 'full-access'],
    ['tool-approval-decide', 'tob', 'm-1', '--outcome', 'allowed-always-kind'],
    ['approval-route', 'tob', '--pairing', 'none'],
    ['browser-daily-connect', 'tob'],
    ['bot-tool', 'tob', 'bot_send_message'],
  ])('refuses %s for Tob itself before any card or run', async (...argv) => {
    const { invoke, run, approve } = await broker();
    const result = await invoke(argv);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'self-escalation-refused' },
    });
    expect(result.error?.message).toMatch(/Bot settings/u);
    expect(approve).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('shows the Human an approval card for the same policy edit on another Bot', async () => {
    const { invoke, run, approve } = await broker();
    expect(await invoke(['approval-template-set', 'ada', 'routine'])).toMatchObject({ ok: true });
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]?.[0]).toMatchObject({
      command: 'approval-template-set',
      via: 'cli',
      patch: { argv: ['approval-template-set', 'ada', 'routine'] },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('still reads Tob and edits its ordinary profile through the usual path', () => {
    for (const argv of [
      ['approval-template-show', 'tob'],
      ['grants', 'tob'],
      ['bot-source-policies', 'tob'],
      ['memory-save', 'tob'],
    ])
      expect(() => authorizeTobHostCli(argv, deps)).not.toThrow();
  });

  it('keeps Browser pairing codes and Daily Browser consent with the Human', () => {
    for (const argv of [
      ['browser-profile-pair', '--out', '/tmp/code'],
      ['browser-borrow-pair', 'ada', '--out', '/tmp/code'],
      ['browser-daily-grant', 'ada'],
    ])
      expect(() => classifyTobHostCli(argv)).toThrow(
        expect.objectContaining({ code: 'cli-command-refused' }),
      );
    for (const argv of [
      ['browser-profile-forget'],
      ['browser-daily-connect', 'ada'],
      ['browser-daily-return', 'ada'],
      ['browser-borrow-return', 'ada'],
    ])
      expect(classifyTobHostCli(argv)).toMatchObject({ write: true });
  });
});
