import { describe, expect, it } from 'vitest';
import { parseCommand, redactReport } from '../windows-lock-probe.mjs';

describe('Windows lock probe commands', () => {
  it('uses observation as the default step and permits metadata-only reads', () => {
    expect(parseCommand(['run'])).toEqual({
      command: 'run',
      steps: ['--observe-lock'],
      accountType: 'unknown',
    });
    expect(parseCommand(['run', '--read-policy'])).toEqual({
      command: 'run',
      steps: ['--read-policy'],
      accountType: 'unknown',
    });
    expect(
      parseCommand(['run', '--observe-lock', '--read-policy', '--account-type', 'local']),
    ).toEqual({
      command: 'run',
      steps: ['--observe-lock', '--read-policy'],
      accountType: 'local',
    });
    expect(parseCommand(['collect'])).toEqual({ command: 'collect' });
    expect(parseCommand(['clean'])).toEqual({ command: 'clean' });
  });

  it.each([
    [],
    ['run', '--observe-lock', '--observe-lock'],
    ['run', '--account-type'],
    ['run', '--account-type', 'alice@example.test'],
    ['run', '--account-type', 'local', '--account-type', 'microsoft'],
    ['run', '--password', 'arbitrary-input'],
    ['run', '--capture'],
    ['run', '--send-sas'],
    ['collect', 'unexpected-file.json'],
    ['clean', 'unexpected-directory'],
    ['install'],
  ])('refuses unsupported command arguments %#', (...args) => {
    expect(() => parseCommand(args)).toThrow(/^Usage:/);
  });
});

describe('Windows lock probe report', () => {
  const lockObservation = {
    status: 'observed',
    before: 'unlocked',
    sawLock: true,
    after: 'unlocked',
  };
  const policy = {
    disableCad: { status: 'missing' },
    softwareSasGeneration: { status: 'read', value: 1 },
  };
  const report = {
    windowsVersion: '10.0.26100',
    accountType: 'microsoft',
    steps: { lockObservation, policy },
  };

  it('copies only bounded diagnostic fields from both report levels', () => {
    const raw = {
      ...report,
      userName: 'private-name',
      hostName: 'private-device',
      steps: {
        imagePath: 'private-location',
        lockObservation: { ...lockObservation, sessionId: 25, logonTime: 1000 },
        policy: {
          keyPath: 'private-registry',
          disableCad: { status: 'missing', value: 'private-value' },
          softwareSasGeneration: { status: 'read', value: 1, code: 5, error: 'private-error' },
        },
      },
    };
    expect(redactReport(raw)).toEqual(report);
  });

  it('rejects free text in fields that survive redaction', () => {
    expect(() => redactReport({ ...report, windowsVersion: '10.0.26100 private-host' })).toThrow();
    expect(() => redactReport({ ...report, accountType: 'somebody@example.test' })).toThrow();
    expect(() =>
      redactReport({
        ...report,
        steps: {
          lockObservation: null,
          policy: {
            ...policy,
            softwareSasGeneration: { status: 'unavailable', code: 'private-error' },
          },
        },
      }),
    ).toThrow();
  });

  it('requires both sampled transitions for an observed unlock result', () => {
    expect(() =>
      redactReport({
        ...report,
        steps: {
          policy: null,
          lockObservation: { ...lockObservation, sawLock: false },
        },
      }),
    ).toThrow('Invalid lock observation');
    const interrupted = {
      status: 'console-changed',
      before: 'unlocked',
      sawLock: true,
      after: null,
    };
    const partial = { ...report, steps: { policy: null, lockObservation: interrupted } };
    expect(redactReport(partial)).toEqual(partial);
  });
});
