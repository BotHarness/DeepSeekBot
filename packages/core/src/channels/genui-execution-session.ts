import {
  parseGenuiDocument,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';
import { createGenuiGuest, type GenuiGuest } from './genui-guest.js';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';
import {
  GENUI_EXECUTION_PROTOCOL,
  parseGenuiExecutionEvent,
  parseGenuiExecutionUpdate,
  type GenuiExecutionFailure,
  type GenuiExecutionOwner,
  type GenuiExecutionReply,
} from './genui-execution.js';
import { GenuiVmError, type GenuiVm } from './genui-vm.js';

interface SessionOptions {
  instanceId: string;
  generation: number;
  document: GenuiDocument;
  state: GenuiDocumentState;
  theme: 'light' | 'dark';
  librarySource: string;
  wasmBinary: ArrayBuffer;
  createVm?: () => GenuiVm;
  send: (reply: GenuiExecutionReply) => void;
  stopped: () => void;
}

export class GenuiExecutionSession {
  private closed = false;
  private sequence = 0;
  private readonly incoming: GenuiExecutionOwner;
  private readonly startTime = performance.now();
  private rateStart = performance.now();
  private received = 0;
  private sent = 0;
  private wake: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly guest: GenuiGuest,
    private readonly options: SessionOptions,
  ) {
    this.incoming = {
      instanceId: options.instanceId,
      generation: options.generation,
      lastSequence: 0,
    };
  }

  get isStopped(): boolean {
    return this.closed;
  }

  start(): void {
    if (this.closed || this.sequence) throw Error('Execution session already started or stopped.');
    try {
      this.guest.theme(this.options.theme);
      this.publish();
      if (this.closed) return;
      this.heartbeat = setInterval(() => {
        if (this.closed) return;
        try {
          this.emit({ ...this.header(), type: 'heartbeat', wasmBytes: this.guest.wasmBytes });
        } catch (error) {
          this.fail(error);
        }
      }, GENUI_EXECUTION_LIMITS.heartbeatMs);
    } catch (error) {
      this.fail(error);
    }
  }

  receive(value: unknown): void {
    if (this.closed) return;
    try {
      this.resetRate();
      if (++this.received > GENUI_EXECUTION_LIMITS.messagesPerSecond)
        throw new GenuiVmError('resource', 'Local event rate budget exceeded.');
      const event = parseGenuiExecutionEvent(value, this.incoming);
      const update = event
        ? undefined
        : parseGenuiExecutionUpdate(value, this.incoming, this.options.document);
      if (!event && !update)
        throw new GenuiVmError('invalid-content', 'Invalid, stale or replayed local command.');
      this.guest.tick(performance.now() - this.startTime);
      if (event) {
        this.incoming.lastSequence = event.sequence;
        this.guest.event(event);
      } else if (update) {
        this.incoming.lastSequence = update.sequence;
        if (update.type === 'restore') this.guest.restore(update.state);
        else this.guest.theme(update.theme);
      }
      this.publish();
    } catch (error) {
      this.fail(error);
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.wake !== undefined) clearTimeout(this.wake);
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat);
    this.wake = undefined;
    this.heartbeat = undefined;
    this.guest.dispose();
    this.options.stopped();
  }

  private header(): Pick<
    GenuiExecutionReply,
    'protocol' | 'instanceId' | 'generation' | 'sequence'
  > {
    return {
      protocol: GENUI_EXECUTION_PROTOCOL,
      instanceId: this.incoming.instanceId,
      generation: this.incoming.generation,
      sequence: this.sequence + 1,
    };
  }

  private resetRate(): void {
    const now = performance.now();
    if (now - this.rateStart >= 1000) {
      this.rateStart = now;
      this.received = 0;
      this.sent = 0;
    }
  }

  private emit(reply: GenuiExecutionReply): void {
    this.resetRate();
    if (++this.sent > GENUI_EXECUTION_LIMITS.messagesPerSecond) {
      this.fail(new GenuiVmError('resource', 'Snapshot rate budget exceeded.'));
      return;
    }
    this.sequence = reply.sequence;
    this.options.send(reply);
  }

  private publish(): void {
    if (this.closed) return;
    const snapshot = this.guest.snapshot();
    this.emit({ ...snapshot, ...this.header(), commandSequence: this.incoming.lastSequence });
    this.scheduleWake();
  }

  private scheduleWake(): void {
    if (this.closed) return;
    if (this.wake !== undefined) clearTimeout(this.wake);
    this.wake = undefined;
    const next = this.guest.nextTimer();
    if (next === null) return;
    const elapsed = performance.now() - this.startTime;
    this.wake = setTimeout(
      () => {
        this.wake = undefined;
        if (this.closed) return;
        try {
          const executed = this.guest.tick(performance.now() - this.startTime);
          if (executed > 0) this.publish();
          else this.scheduleWake();
        } catch (error) {
          this.fail(error);
        }
      },
      Math.max(1, Math.ceil(next - elapsed)),
    );
  }

  private fail(error: unknown): void {
    if (this.closed) return;
    const reason: GenuiExecutionFailure =
      error instanceof GenuiVmError ? error.reason : 'invalid-content';
    const detail = error instanceof GenuiVmError ? error.message : 'Generated execution failed.';
    const reply = {
      ...this.header(),
      type: 'error',
      reason,
      detail,
      wasmBytes: this.guest.wasmBytes,
    } satisfies GenuiExecutionReply;
    this.sequence = reply.sequence;
    try {
      this.options.send(reply);
    } finally {
      this.dispose();
    }
  }
}

export async function createGenuiExecutionSession(
  options: SessionOptions,
): Promise<GenuiExecutionSession> {
  if (
    !/^[a-zA-Z0-9._:-]{1,100}$/u.test(options.instanceId) ||
    !Number.isSafeInteger(options.generation) ||
    options.generation < 1
  )
    throw new GenuiVmError('invalid-content', 'Invalid execution mount identity.');
  const document = parseGenuiDocument(options.document);
  const guest = await createGenuiGuest({ ...options, document });
  const session = new GenuiExecutionSession(guest, { ...options, document });
  session.start();
  return session;
}
