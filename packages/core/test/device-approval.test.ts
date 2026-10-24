import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDeviceApprovalScope } from '../src/workspaces/device-approval.js';
import { createTempRoot } from './helpers.js';

describe('durable device approval targets', () => {
  it('retains the same target after restart but never resurrects a switched-away target', () => {
    const file = join(createTempRoot('device-approval-'), 'scope.json');
    let target = 'local';
    const scope = createDeviceApprovalScope(file, () => target);
    const original = scope.current();
    expect(createDeviceApprovalScope(file, () => target).current()).toBe(original);
    target = 'container';
    scope.invalidate();
    expect(scope.current()).not.toBe(original);
    target = 'local';
    scope.invalidate();
    const switchedBack = scope.current();
    expect(switchedBack).not.toBe(original);
    expect(createDeviceApprovalScope(file, () => target).current()).toBe(switchedBack);
  });

  it('detects a target changed while the Host was stopped', () => {
    const file = join(createTempRoot('device-approval-offline-'), 'scope.json');
    const original = createDeviceApprovalScope(file, () => 'container-a').current();
    expect(createDeviceApprovalScope(file, () => 'container-b').current()).not.toBe(original);
    expect(createDeviceApprovalScope(file, () => 'container-a').current()).not.toBe(original);
  });
});
