import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  claimQqTestClient,
  identifyQqTestClient,
  listQqTestClients,
  markQqTestLaunch,
  markQqTestConnect,
  registerQqTestClient,
  releaseQqTestClient,
  selectedQqTestClient,
} from '../dev-qq-test-clients.mjs';

const directories = [];
const owner = {
  task: 'codex/local/synthetic-task',
  receiver: 'synthetic-host',
  worktree: process.cwd(),
  branch: 'codex/synthetic-qa',
  confirmedIdle: true,
};
function fixture(location = 'local') {
  const directory = mkdtempSync(join(tmpdir(), 'bh-qq-qa-'));
  directories.push(directory);
  const options = { path: join(directory, 'clients.json') };
  registerQqTestClient(
    'QA1',
    {
      name: 'Synthetic QQ QA',
      appId: '100001',
      testGroup: '123456789',
      home: join(directory, 'home'),
      location,
    },
    options,
  );
  return options;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('reusable QQ QA clients', () => {
  it('retains a reusable native authorization location as metadata without changing that Profile', () => {
    const options = fixture();
    const sourceHome = join(directories.at(-1), 'retained-native-home');
    mkdirSync(sourceHome);
    writeFileSync(join(sourceHome, 'native-marker'), 'unchanged');
    registerQqTestClient(
      'QA2',
      {
        name: 'Synthetic QQ QA2',
        appId: '100002',
        testGroup: '123456789',
        home: join(directories.at(-1), 'qa2-home'),
        sourceHome,
      },
      options,
    );
    claimQqTestClient('QA2', owner, options);
    expect(selectedQqTestClient('QA2', owner, options).sourceHome).toBe(sourceHome);
    expect(readFileSync(join(sourceHome, 'native-marker'), 'utf8')).toBe('unchanged');
    expect(JSON.stringify(listQqTestClients(options))).not.toContain(sourceHome);
  });
  it('keeps an uncertain credential connect occupied and refuses another attempt or owner', () => {
    const options = fixture();
    claimQqTestClient('QA1', owner, options);
    markQqTestConnect('QA1', owner, options);
    expect(() => markQqTestConnect('QA1', owner, options)).toThrow('already requested');
    expect(() => markQqTestConnect('QA1', { ...owner, branch: 'other' }, options)).toThrow(
      'current task',
    );
    expect(listQqTestClients(options)[0].availability).toBe('claimed');
  });
  it('records the authenticated identity only for its owner and fences identity replacement', () => {
    const options = fixture();
    claimQqTestClient('QA1', owner, options);
    expect(() =>
      identifyQqTestClient('QA1', '100001', { ...owner, task: 'other' }, options),
    ).toThrow('current task');
    expect(identifyQqTestClient('QA1', '100001', owner, options)).toMatchObject({
      appIdentityKnown: true,
    });
    expect(() => identifyQqTestClient('QA1', '100002', owner, options)).toThrow('identity changed');
    const before = readFileSync(options.path, 'utf8');
    registerQqTestClient(
      'QA2',
      { name: 'Synthetic QQ QA2', testGroup: '123456789', home: 'other-home' },
      options,
    );
    claimQqTestClient('QA2', owner, options);
    expect(() => identifyQqTestClient('QA2', '100001', owner, options)).toThrow('independent Apps');
    expect(JSON.parse(before).clients.QA1.appId).toBe('100001');
  });
  it('retains a claim across independent processes and refuses another worktree or task', () => {
    const options = fixture();
    claimQqTestClient('QA1', owner, options);
    const result = spawnSync(process.execPath, ['scripts/dev-qq-test-clients.mjs', 'list'], {
      encoding: 'utf8',
      env: { ...process.env, BOTHARNESS_QQ_TEST_CLIENTS_FILE: options.path },
      shell: false,
      windowsHide: true,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)[0]).toMatchObject({
      availability: 'claimed',
      claim: { task: owner.task },
    });
    expect(() => claimQqTestClient('QA1', { ...owner, task: 'another' }, options)).toThrow(
      'already claimed',
    );
    expect(() => selectedQqTestClient('QA1', { ...owner, branch: 'another' }, options)).toThrow(
      'current task',
    );
    expect(() =>
      releaseQqTestClient(
        'QA1',
        { ...owner, worktree: join(process.cwd(), 'other'), confirmedStopped: true },
        options,
      ),
    ).toThrow('claiming task');
    expect(listQqTestClients(options)[0].availability).toBe('claimed');
  });

  it('requires fresh stop confirmation and preserves the native Profile across handoff', () => {
    const options = fixture();
    expect(() => claimQqTestClient('QA1', { ...owner, confirmedIdle: false }, options)).toThrow(
      'every machine',
    );
    claimQqTestClient('QA1', owner, options);
    const home = selectedQqTestClient('QA1', owner, options).home;
    mkdirSync(home);
    writeFileSync(join(home, 'native-profile-marker'), 'retained');
    expect(() => releaseQqTestClient('QA1', owner, options)).toThrow('exact receiver');
    releaseQqTestClient('QA1', { ...owner, confirmedStopped: true }, options);
    const next = { ...owner, task: 'next-task', branch: 'codex/next-qa' };
    claimQqTestClient('QA1', next, options);
    expect(selectedQqTestClient('QA1', next, options).home).toBe(home);
    expect(readFileSync(join(home, 'native-profile-marker'), 'utf8')).toBe('retained');
  });

  it('refuses duplicate Apps, credentials and replacement of a claimed slot without modifying it', () => {
    const options = fixture();
    const before = readFileSync(options.path, 'utf8');
    expect(() =>
      registerQqTestClient(
        'QA2',
        { name: 'Another', appId: '100001', testGroup: '123456789', home: 'another' },
        options,
      ),
    ).toThrow('independent Apps');
    expect(() =>
      registerQqTestClient(
        'QA2',
        { name: 'Another', testGroup: '123456789', home: 'another', appSecret: 'SYNTHETIC_SECRET' },
        options,
      ),
    ).toThrow('metadata only');
    expect(readFileSync(options.path, 'utf8')).toBe(before);
    claimQqTestClient('QA1', owner, options);
    expect(() =>
      registerQqTestClient(
        'QA1',
        { name: 'Replacement', testGroup: '123456789', home: 'another' },
        options,
      ),
    ).toThrow('claimed');
    expect(JSON.stringify(listQqTestClients(options))).not.toContain('100001');
  });

  it('fails closed for a concurrent registry writer and does not overwrite its lock', () => {
    const options = fixture();
    mkdirSync(`${options.path}.lock`);
    const before = readFileSync(options.path, 'utf8');
    expect(() => claimQqTestClient('QA1', owner, options)).toThrow('registry busy');
    expect(readFileSync(options.path, 'utf8')).toBe(before);
  });

  it('keeps uncertain launch attempts claimed and refuses repeated or remote launches', () => {
    const options = fixture();
    claimQqTestClient('QA1', owner, options);
    markQqTestLaunch('QA1', owner, options);
    expect(() => markQqTestLaunch('QA1', owner, options)).toThrow('already requested');
    expect(listQqTestClients(options)[0].availability).toBe('claimed');
    const remote = fixture('remote');
    claimQqTestClient('QA1', owner, remote);
    expect(() => markQqTestLaunch('QA1', owner, remote)).toThrow('Remote');
  });
});
