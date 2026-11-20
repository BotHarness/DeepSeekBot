import { GenuiExecutionPortError, type GenuiExecutionPort } from './genui-execution-supervisor.js';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';

type PortHandlers = Parameters<GenuiExecutionPort['subscribe']>[0];
interface Lease {
  handlers?: PortHandlers;
}
interface WorkerOwner {
  source: string;
  worker: Worker;
  url: string;
  leases: Map<number, Lease>;
  closed: boolean;
  stop: () => void;
}

let active: WorkerOwner | undefined;
let nextPortId = 0;

function createOwner(source: string): WorkerOwner {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  let worker: Worker;
  try {
    worker = new Worker(url, { name: 'GenUI' });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  const owner: WorkerOwner = {
    source,
    worker,
    url,
    leases: new Map(),
    closed: false,
    stop: () => {
      if (owner.closed) return;
      owner.closed = true;
      if (active === owner) active = undefined;
      const listeners = [...owner.leases.values()].flatMap((lease) =>
        lease.handlers ? [lease.handlers] : [],
      );
      owner.leases.clear();
      worker.removeEventListener('message', message);
      worker.removeEventListener('error', failure);
      worker.removeEventListener('messageerror', failure);
      try {
        worker.terminate();
      } finally {
        URL.revokeObjectURL(url);
        for (const handlers of listeners) {
          try {
            handlers.failed();
          } catch {}
        }
      }
    },
  };
  const message = (event: MessageEvent<unknown>) => {
    if (owner.closed) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || !('portId' in data) || !('reply' in data)) {
      owner.stop();
      return;
    }
    if (typeof data.portId !== 'number' || !Number.isSafeInteger(data.portId)) {
      owner.stop();
      return;
    }
    owner.leases.get(data.portId)?.handlers?.message(data.reply);
  };
  const failure = (event: Event) => {
    event.preventDefault();
    owner.stop();
  };
  worker.addEventListener('message', message);
  worker.addEventListener('error', failure);
  worker.addEventListener('messageerror', failure);
  return owner;
}

export function createGenuiWorkerPort(source: string): GenuiExecutionPort {
  if (active && active.source !== source)
    throw new GenuiExecutionPortError('resource', 'A different GenUI runtime is active.');
  if (active && active.leases.size >= GENUI_EXECUTION_LIMITS.activeDocuments)
    throw new GenuiExecutionPortError('resource', 'GenUI document capacity is occupied.');
  const owner = active ?? (active = createOwner(source));
  const portId = ++nextPortId;
  const lease: Lease = {};
  owner.leases.set(portId, lease);
  let closed = false;
  let subscribed = false;
  const live = () => !closed && !owner.closed && owner.leases.get(portId) === lease;
  return {
    send: (command) => {
      if (live()) owner.worker.postMessage({ portId, command });
    },
    subscribe: (handlers) => {
      if (!live() || subscribed) throw Error('Worker port is closed or already subscribed.');
      subscribed = true;
      lease.handlers = handlers;
      return () => {
        delete lease.handlers;
      };
    },
    terminate: (reason) => {
      if (!live()) return;
      closed = true;
      delete lease.handlers;
      owner.leases.delete(portId);
      if (
        !owner.leases.size ||
        reason === 'execution' ||
        reason === 'startup' ||
        reason === 'memory'
      ) {
        owner.stop();
      } else {
        try {
          owner.worker.postMessage({ portId, dispose: true });
        } catch {
          owner.stop();
        }
      }
    },
  };
}
