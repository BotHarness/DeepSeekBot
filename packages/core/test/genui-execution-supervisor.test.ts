import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenuiExecutionSupervisor,
  type GenuiExecutionPort,
  type GenuiExecutionSnapshot,
} from '../src/channels/genui-execution-supervisor.js';
import {
  GENUI_EXECUTION_PROTOCOL,
  type GenuiExecutionFailure,
} from '../src/channels/genui-execution.js';
import { GENUI_EXECUTION_LIMITS } from '../src/channels/genui-execution-limits.js';
import { initialGenuiDocumentState } from '../src/channels/genui-document.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';

const header = { protocol: GENUI_EXECUTION_PROTOCOL, instanceId: 'supervisor-test', generation: 3 };
const initial = initialGenuiDocumentState(syntheticGenuiDocument);
const owners: GenuiExecutionSupervisor[] = [];

class ControlledPort implements GenuiExecutionPort {
  readonly sent: unknown[] = [];
  terminations = 0;
  detachments = 0;
  handlers: Parameters<GenuiExecutionPort['subscribe']>[0] | undefined;

  send(value: unknown): void {
    this.sent.push(value);
  }
  subscribe(handlers: Parameters<GenuiExecutionPort['subscribe']>[0]) {
    this.handlers = handlers;
    return () => {
      this.handlers = undefined;
      this.detachments++;
    };
  }
  terminate(): void {
    this.terminations++;
  }
  message(value: unknown): void {
    this.handlers?.message(value);
  }
}

function snapshot(sequence: number, commandSequence = 0) {
  return {
    ...header,
    sequence,
    commandSequence,
    type: 'snapshot',
    html: '<p>Valid bounded output</p>',
    state: initial,
    controls: [],
    wasmBytes: 16 * 1024 * 1024,
  };
}

function open() {
  const port = new ControlledPort();
  const snapshots: GenuiExecutionSnapshot[] = [];
  const stops: (GenuiExecutionFailure | undefined)[] = [];
  const owner = new GenuiExecutionSupervisor({
    ...header,
    document: syntheticGenuiDocument,
    state: initial,
    theme: 'light',
    createPort: () => port,
    onSnapshot: (value) => snapshots.push(value),
    onStopped: (reason) => stops.push(reason),
  });
  owners.push(owner);
  return { port, owner, snapshots, stops };
}

beforeEach(() =>
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  }),
);
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.useRealTimers();
});

describe('GenUI trusted external execution supervisor', () => {
  it('terminates a silent startup and releases callbacks, queues and timers exactly once', () => {
    const { owner, port, stops } = open();
    expect(port.sent).toHaveLength(1);
    owner.send({ type: 'theme', theme: 'dark' });
    expect(port.sent).toHaveLength(1);
    vi.advanceTimersByTime(GENUI_EXECUTION_LIMITS.startupMs);
    expect(stops).toEqual(['startup']);
    expect(port.terminations).toBe(1);
    expect(port.detachments).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    owner.dispose();
    expect(port.terminations).toBe(1);
  });

  it('does not let heartbeats extend an independently armed command deadline', () => {
    const { owner, port, stops } = open();
    port.message(snapshot(1));
    owner.send({ type: 'event', event: 'click', targetId: '1' });
    for (let sequence = 2; sequence <= 5; sequence++) {
      vi.advanceTimersByTime(100);
      port.message({ ...header, sequence, type: 'heartbeat', wasmBytes: 16 * 1024 * 1024 });
    }
    expect(owner.isStopped).toBe(false);
    vi.advanceTimersByTime(100);
    expect(stops).toEqual(['execution']);
    expect(port.terminations).toBe(1);
  });

  it('does not mistake an unsolicited timer snapshot for command completion', () => {
    const { owner, port, stops } = open();
    port.message(snapshot(1));
    owner.send({ type: 'theme', theme: 'dark' });
    vi.advanceTimersByTime(300);
    port.message(snapshot(2, 0));
    vi.advanceTimersByTime(200);
    expect(stops).toEqual(['execution']);
  });

  it('allows only one in-flight command and dispatches the next after its exact acknowledgement', () => {
    const { owner, port, stops } = open();
    owner.send({ type: 'theme', theme: 'dark' });
    owner.send({ type: 'restore', state: initial });
    expect(port.sent).toHaveLength(1);
    port.message(snapshot(1));
    expect(port.sent).toHaveLength(2);
    expect(port.sent[1]).toMatchObject({ type: 'theme', sequence: 1 });
    port.message(snapshot(2, 1));
    expect(port.sent).toHaveLength(3);
    expect(port.sent[2]).toMatchObject({ type: 'restore', sequence: 2 });
    port.message(snapshot(3, 2));
    vi.advanceTimersByTime(GENUI_EXECUTION_LIMITS.commandTimeoutMs);
    expect(owner.isStopped).toBe(false);
    expect(stops).toEqual([]);
  });

  it('fails closed on replay, stale generation, invalid state, future ack and early heartbeat', () => {
    for (const value of [
      { ...snapshot(1), generation: 2 },
      { ...snapshot(1), state: { version: 1, values: { injected: true } } },
      snapshot(1, 1),
      { ...header, sequence: 1, type: 'heartbeat', wasmBytes: 0 },
    ]) {
      const { owner, port, stops } = open();
      port.message(value);
      expect(owner.isStopped).toBe(true);
      expect(stops).toEqual(['invalid-content']);
    }
    const { port, stops } = open();
    port.message(snapshot(1));
    port.message(snapshot(1));
    expect(stops).toEqual(['invalid-content']);
  });

  it('backpressures trusted command bursts without raising the existing reply-rate or queue budgets', () => {
    const { owner, port, stops } = open();
    port.message(snapshot(1));
    for (let sequence = 1; sequence <= 20; sequence++) {
      owner.send({ type: 'theme', theme: 'dark' });
      port.message(snapshot(sequence + 1, sequence));
    }
    for (let index = 0; index < 4; index++) owner.send({ type: 'theme', theme: 'light' });
    expect(port.sent).toHaveLength(21);
    vi.advanceTimersByTime(1000);
    expect(port.sent).toHaveLength(21);
    expect(stops).toEqual([]);
    vi.advanceTimersByTime(1);
    for (let sequence = 21; sequence <= 24; sequence++) {
      expect(port.sent).toHaveLength(sequence + 1);
      port.message(snapshot(sequence + 1, sequence));
    }
    expect(owner.isStopped).toBe(false);
    owner.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds queued intent and refuses even a well-formed Worker message flood', () => {
    const queued = open();
    for (let index = 0; index < GENUI_EXECUTION_LIMITS.queuedEvents + 1; index++)
      queued.owner.send({ type: 'theme', theme: 'light' });
    expect(queued.stops).toEqual(['resource']);
    expect(queued.port.sent).toHaveLength(1);
    const flood = open();
    flood.port.message(snapshot(1));
    for (let sequence = 2; sequence <= GENUI_EXECUTION_LIMITS.messagesPerSecond + 1; sequence++)
      flood.port.message({ ...header, sequence, type: 'heartbeat', wasmBytes: 0 });
    expect(flood.stops).toEqual(['resource']);
  });

  it('stops on Worker failure and fences saved callbacks after disposal', () => {
    const { owner, port, stops, snapshots } = open();
    const saved = port.handlers;
    saved?.failed();
    expect(stops).toEqual(['execution']);
    saved?.message(snapshot(1));
    owner.send({ type: 'theme', theme: 'dark' });
    expect(snapshots).toEqual([]);
    expect(port.sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
