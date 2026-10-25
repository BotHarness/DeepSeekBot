import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDeviceApprovalScope } from '../src/workspaces/device-approval.js';
import { createTempRoot } from './helpers.js';

describe('durable device approval targets', () => {
  it.each(['broken-json', '{"identity":123}'])(
    'replaces an unusable target record with a durable fresh epoch: %s',
    (invalid) => {
      const file = join(createTempRoot('device-approval-corrupt-'), 'scope.json');
      const original = createDeviceApprovalScope(file, () => 'local').current();
      writeFileSync(file, invalid);
      const recovered = createDeviceApprovalScope(file, () => 'local').current();
      expect(recovered).not.toBe(original);
      expect(createDeviceApprovalScope(file, () => 'local').current()).toBe(recovered);
    },
  );

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
