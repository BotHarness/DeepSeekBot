import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGenuiWorkerPort } from '../src/channels/genui-worker-port.js';
import {
  GenuiExecutionSupervisor,
  type GenuiExecutionPort,
} from '../src/channels/genui-execution-supervisor.js';
import { initialGenuiDocumentState } from '../src/channels/genui-document.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';

class ControlledWorker extends EventTarget {
  static readonly created: ControlledWorker[] = [];
  readonly sent: unknown[] = [];
  terminations = 0;

  constructor(readonly url: string) {
    super();
    ControlledWorker.created.push(this);
  }

  postMessage(value: unknown): void {
    this.sent.push(value);
  }

  terminate(): void {
    this.terminations++;
  }
}

const ports: GenuiExecutionPort[] = [];
const owners: GenuiExecutionSupervisor[] = [];

function open(): GenuiExecutionPort {
  const port = createGenuiWorkerPort('/* trusted packaged Worker */');
  ports.push(port);
  return port;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', ControlledWorker);
  vi.spyOn(URL, 'createObjectURL');
  vi.spyOn(URL, 'revokeObjectURL');
});

afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  for (const port of ports.splice(0)) port.terminate();
  ControlledWorker.created.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('GenUI Browser Worker resource ownership', () => {
  it('shares one physical Worker across independent document ports', () => {
    const first = open();
    const second = open();
    expect(ControlledWorker.created).toHaveLength(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    first.terminate();
    expect(ControlledWorker.created[0]?.terminations).toBe(0);
    second.terminate();
    open();
    expect(ControlledWorker.created).toHaveLength(2);
    expect(ControlledWorker.created[0]?.terminations).toBe(1);
  });

  it('releases listeners, URL and capacity once; stale messages cannot reach consumers', () => {
    const port = open();
    const worker = ControlledWorker.created[0];
    if (!worker) throw Error('Missing controlled Worker.');
    const message = vi.fn();
    const failed = vi.fn();
    port.subscribe({ message, failed });
    port.send('start');
    const sent = worker.sent[0] as { portId: number };
    worker.dispatchEvent(
      new MessageEvent('message', { data: { portId: sent.portId, reply: { type: 'heartbeat' } } }),
    );
    expect(message).toHaveBeenCalledTimes(1);
    port.terminate();
    port.terminate();
    worker.dispatchEvent(new MessageEvent('message', { data: 'stale' }));
    worker.dispatchEvent(new Event('error', { cancelable: true }));
    port.send('stale');
    expect(message).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
    expect(worker.sent).toHaveLength(1);
    expect(worker.terminations).toBe(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(worker.url);
    expect(() => port.subscribe({ message, failed })).toThrow();
    expect(() => open()).not.toThrow();
  });

  it('reclaims a failed construction before allowing another attempt', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw Error('Worker unavailable');
        }
      },
    );
    expect(() => open()).toThrow('Worker unavailable');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    vi.stubGlobal('Worker', ControlledWorker);
    expect(() => open()).not.toThrow();
  });

  it('reports capacity refusal as a bounded resource outcome without disturbing the first owner', () => {
    const occupied = Array.from({ length: 4 }, () => open());
    const stops = vi.fn();
    const owner = new GenuiExecutionSupervisor({
      instanceId: 'capacity-test',
      generation: 1,
      document: syntheticGenuiDocument,
      state: initialGenuiDocumentState(syntheticGenuiDocument),
      theme: 'light',
      createPort: open,
      onSnapshot: vi.fn(),
      onStopped: stops,
    });
    owners.push(owner);
    expect(stops).toHaveBeenCalledExactlyOnceWith('resource');
    expect(owner.isStopped).toBe(true);
    expect(ControlledWorker.created[0]?.terminations).toBe(0);
    occupied[0]?.terminate();
    expect(() => open()).not.toThrow();
  });

  it('routes only to the owning lease and preserves siblings on normal disposal', () => {
    const first = open();
    const second = open();
    const firstMessage = vi.fn();
    const secondMessage = vi.fn();
    first.subscribe({ message: firstMessage, failed: vi.fn() });
    second.subscribe({ message: secondMessage, failed: vi.fn() });
    first.send('one');
    second.send('two');
    const worker = ControlledWorker.created[0]!;
    const [one, two] = worker.sent as { portId: number; command: unknown }[];
    expect(one!.portId).not.toBe(two!.portId);
    worker.dispatchEvent(
      new MessageEvent('message', { data: { portId: two!.portId, reply: 'second' } }),
    );
    expect(firstMessage).not.toHaveBeenCalled();
    expect(secondMessage).toHaveBeenCalledExactlyOnceWith('second');
    first.terminate();
    worker.dispatchEvent(
      new MessageEvent('message', { data: { portId: one!.portId, reply: 'stale' } }),
    );
    expect(firstMessage).not.toHaveBeenCalled();
    expect(worker.sent.at(-1)).toEqual({ portId: one!.portId, dispose: true });
    second.send('still-live');
    expect(worker.sent.at(-1)).toEqual({ portId: two!.portId, command: 'still-live' });
  });

  it('hard-stops the shared Worker on an execution deadline and notifies siblings once', () => {
    const first = open();
    const second = open();
    const failed = vi.fn();
    second.subscribe({ message: vi.fn(), failed });
    first.terminate('execution');
    expect(failed).toHaveBeenCalledTimes(1);
    expect(ControlledWorker.created[0]?.terminations).toBe(1);
    second.send('stale');
    second.terminate();
    expect(ControlledWorker.created[0]?.sent).toEqual([]);
    open();
    expect(ControlledWorker.created).toHaveLength(2);
  });

  it('cleans every sibling after a Worker failure even when one consumer throws', () => {
    const first = open();
    const second = open();
    const failed = vi.fn();
    first.subscribe({
      message: vi.fn(),
      failed: () => {
        throw Error('Consumer failed');
      },
    });
    second.subscribe({ message: vi.fn(), failed });
    const worker = ControlledWorker.created[0];
    if (!worker) throw Error('Missing controlled Worker.');
    worker.dispatchEvent(new Event('error', { cancelable: true }));
    expect(failed).toHaveBeenCalledTimes(1);
    expect(worker.terminations).toBe(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(worker.url);
    expect(() => open()).not.toThrow();
  });
});
