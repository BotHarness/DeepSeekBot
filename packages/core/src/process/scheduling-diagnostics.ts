import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';

export const SCHEDULING_DIAGNOSTIC_CHANNEL = 'botharness.scheduling.v1';
const output = channel(SCHEDULING_DIAGNOSTIC_CHANNEL);
const scope = new AsyncLocalStorage<number>();
const identities = new WeakMap<object, number>();
let nextId = 1;

export type SchedulingDiagnostic =
  | { kind: 'steer'; turn: number; delivered: boolean }
  | { kind: 'scan-start' | 'scan-coalesced'; turn: number; operation: number }
  | { kind: 'scan-end'; turn: number; operation: number; outcome: 'ok' | 'stale' | 'error' }
  | { kind: 'exec-dispatch'; operation: number; scan: number; mode: 'worker' | 'direct' }
  | { kind: 'exec-settle'; operation: number; scan: number; outcome: 'ok' | 'error' };

export function schedulingDiagnosticsEnabled(): boolean {
  return process.env.BOTHARNESS_SCHEDULING_DIAGNOSTICS === '1' && output.hasSubscribers;
}

export function schedulingIdentity(owner?: object): number {
  if (!schedulingDiagnosticsEnabled()) return 0;
  if (owner === undefined) return nextId++;
  const known = identities.get(owner);
  if (known !== undefined) return known;
  const id = nextId++;
  identities.set(owner, id);
  return id;
}

export function schedulingScan(): number {
  return scope.getStore() ?? 0;
}

export function withinSchedulingScan<T>(operation: number, run: () => T): T {
  return operation === 0 ? run() : scope.run(operation, run);
}

export function recordSchedulingDiagnostic(event: SchedulingDiagnostic): void {
  if (!schedulingDiagnosticsEnabled()) return;
  output.publish({ ...event, at: Date.now(), monotonicMs: performance.now() });
}
