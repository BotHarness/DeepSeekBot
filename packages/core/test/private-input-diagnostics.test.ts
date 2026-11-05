import { describe, expect, it, vi } from 'vitest';
import {
  PrivateInputFailure,
  privateInputLog,
  privateToolFailure,
  privateToolOutcome,
} from '../src/credentials/diagnostics.js';
import { PrivateInputRefusal } from '../src/credentials/im-origin.js';

describe('private input diagnostics', () => {
  it('writes every private input phase to the diagnostic log, failures as warnings', () => {
    const info = vi.fn();
    const record = vi.fn();
    const log = privateInputLog(info, { record });
    log('consume-failed', { botSlug: 'ada', requestId: 'r1', reason: 'timeout' });
    log('consume-completed', { botSlug: 'ada', durationMs: 4 });
    log('tool-unsuccessful', { tool: 'secret_http', httpStatus: 401 });
    expect(info).toHaveBeenCalledWith('private-input %j', {
      phase: 'consume-failed',
      botSlug: 'ada',
      requestId: 'r1',
      reason: 'timeout',
    });
    expect(record.mock.calls).toEqual([
      [
        'private-input',
        'consume-failed',
        { botSlug: 'ada', requestId: 'r1', reason: 'timeout' },
        { bot: 'ada', level: 'warn' },
      ],
      [
        'private-input',
        'consume-completed',
        { botSlug: 'ada', durationMs: 4 },
        { bot: 'ada', level: 'info' },
      ],
      [
        'private-input',
        'tool-unsuccessful',
        { tool: 'secret_http', httpStatus: 401 },
        { level: 'warn' },
      ],
    ]);
  });

  it('summarizes tool outcomes and failures by reason', () => {
    expect(
      privateToolOutcome(JSON.stringify({ consumer: 'http-request-v1', refused: 'dns failed' })),
    ).toEqual({ phase: 'tool-refused', details: { reason: 'dns failed' } });
    expect(
      privateToolOutcome(
        JSON.stringify({ consumer: 'http-request-v1', successful: false, httpStatus: 403 }),
      ),
    ).toEqual({ phase: 'tool-unsuccessful', details: { httpStatus: 403 } });
    expect(
      privateToolOutcome(JSON.stringify({ consumer: 'command-v1', successful: true, exitCode: 0 })),
    ).toBeUndefined();
    expect(privateToolOutcome('not json')).toBeUndefined();
    expect(privateToolFailure(new PrivateInputFailure('stopped', 'timeout'))).toEqual({
      reason: 'timeout',
      errorName: 'PrivateInputFailure',
    });
    expect(privateToolFailure(new PrivateInputRefusal('private-source-revoked'))).toEqual({
      reason: 'private-source-revoked',
      errorName: 'PrivateInputRefusal',
    });
  });
});
