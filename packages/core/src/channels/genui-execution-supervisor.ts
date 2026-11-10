import {
  parseGenuiDocument,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';
import {
  GENUI_EXECUTION_PROTOCOL,
  parseGenuiExecutionEvent,
  parseGenuiExecutionReply,
  parseGenuiExecutionUpdate,
  type GenuiExecutionEvent,
  type GenuiExecutionFailure,
  type GenuiExecutionOwner,
  type GenuiExecutionReply,
  type GenuiExecutionUpdate,
} from './genui-execution.js';

export interface GenuiExecutionPort {
  send(value: unknown): void;
  subscribe(handlers: { message: (value: unknown) => void; failed: () => void }): () => void;
  terminate(reason?: GenuiExecutionFailure): void;
}

export class GenuiExecutionPortError extends Error {
  constructor(
    readonly reason: GenuiExecutionFailure,
    message: string,
  ) {
    super(message);
    this.name = 'GenuiExecutionPortError';
  }
}

export type GenuiExecutionCommand =
  | Pick<GenuiExecutionEvent, 'type' | 'event' | 'targetId' | 'value' | 'checked'>
  | Pick<Extract<GenuiExecutionUpdate, { type: 'restore' }>, 'type' | 'state'>
  | Pick<Extract<GenuiExecutionUpdate, { type: 'theme' }>, 'type' | 'theme'>;
export type GenuiExecutionSnapshot = Extract<GenuiExecutionReply, { type: 'snapshot' }>;

export class GenuiExecutionSupervisor {
  private document: GenuiDocument | undefined;
  private port: GenuiExecutionPort | undefined;
  private unsubscribe: (() => void) | undefined;
  private onSnapshot: ((snapshot: GenuiExecutionSnapshot) => void) | undefined;
  private onStopped: ((reason: GenuiExecutionFailure | undefined) => void) | undefined;
  private readonly incoming: GenuiExecutionOwner;
  private readonly outgoing: GenuiExecutionOwner;
  private readonly queue: (GenuiExecutionEvent | GenuiExecutionUpdate)[] = [];
  private pending: GenuiExecutionEvent | GenuiExecutionUpdate | undefined;
  private startup: ReturnType<typeof setTimeout> | undefined;
  private liveness: ReturnType<typeof setTimeout> | undefined;
  private action: ReturnType<typeof setTimeout> | undefined;
  private dispatch: ReturnType<typeof setTimeout> | undefined;
  private readonly dispatchTimes: number[] = [];
  private ready = false;
  private closed = false;
  private acknowledged = 0;
  private rateStart = performance.now();
  private messages = 0;

  constructor(options: {
    instanceId: string;
    generation: number;
    document: GenuiDocument;
    state: GenuiDocumentState;
    theme: 'light' | 'dark';
    createPort: () => GenuiExecutionPort;
    onSnapshot: (snapshot: GenuiExecutionSnapshot) => void;
    onStopped: (reason: GenuiExecutionFailure | undefined) => void;
  }) {
    this.incoming = {
      instanceId: options.instanceId,
      generation: options.generation,
      lastSequence: 0,
    };
    this.outgoing = { ...this.incoming };
    this.onSnapshot = options.onSnapshot;
    this.onStopped = options.onStopped;
    try {
      if (
        !/^[a-zA-Z0-9._:-]{1,100}$/u.test(options.instanceId) ||
        !Number.isSafeInteger(options.generation) ||
        options.generation < 1 ||
        (options.theme !== 'light' && options.theme !== 'dark')
      ) {
        this.stop('invalid-content');
        return;
      }
      this.document = parseGenuiDocument(options.document);
      const state = validateGenuiDocumentState(this.document, options.state);
      this.port = options.createPort();
      this.unsubscribe = this.port.subscribe({
        message: this.receive,
        failed: () => this.stop('execution'),
      });
      this.startup = setTimeout(() => this.stop('startup'), GENUI_EXECUTION_LIMITS.startupMs);
      this.port.send({
        protocol: GENUI_EXECUTION_PROTOCOL,
        instanceId: options.instanceId,
        generation: options.generation,
        type: 'boot',
        document: this.document,
        state,
        theme: options.theme,
      });
    } catch (error) {
      this.stop(error instanceof GenuiExecutionPortError ? error.reason : 'unsupported');
    }
  }

  get isStopped(): boolean {
    return this.closed;
  }

  get pendingControlIds(): ReadonlySet<string> {
    const controls = new Set<string>();
    for (const command of [this.pending, ...this.queue])
      if (command?.type === 'event') controls.add(command.targetId);
    return controls;
  }

  send(command: GenuiExecutionCommand): void {
    if (this.closed || !this.document) return;
    if (this.queue.length + (this.pending ? 1 : 0) >= GENUI_EXECUTION_LIMITS.queuedEvents) {
      this.stop('resource');
      return;
    }
    const candidate = {
      ...command,
      protocol: GENUI_EXECUTION_PROTOCOL,
      instanceId: this.outgoing.instanceId,
      generation: this.outgoing.generation,
      sequence: this.outgoing.lastSequence + 1,
    };
    const parsed =
      parseGenuiExecutionEvent(candidate, this.outgoing) ??
      parseGenuiExecutionUpdate(candidate, this.outgoing, this.document);
    if (!parsed) {
      this.stop('invalid-content');
      return;
    }
    this.outgoing.lastSequence = parsed.sequence;
    this.queue.push(parsed);
    this.flush();
  }

  dispose(): void {
    this.stop(undefined);
  }

  private receive = (value: unknown): void => {
    if (this.closed || !this.document) return;
    try {
      const now = performance.now();
      if (now - this.rateStart >= 1000) {
        this.rateStart = now;
        this.messages = 0;
      }
      if (++this.messages > GENUI_EXECUTION_LIMITS.messagesPerSecond) {
        this.stop('resource');
        return;
      }
      const reply = parseGenuiExecutionReply(value, this.incoming, this.document);
      if (!reply) {
        this.stop('invalid-content');
        return;
      }
      this.incoming.lastSequence = reply.sequence;
      if (reply.type === 'error') {
        this.stop(reply.reason);
        return;
      }
      if (reply.type === 'heartbeat') {
        if (!this.ready) {
          this.stop('invalid-content');
          return;
        }
        this.armLiveness();
        return;
      }
      if (!this.ready && reply.commandSequence !== 0) {
        this.stop('invalid-content');
        return;
      }
      if (
        reply.commandSequence !== this.acknowledged &&
        reply.commandSequence !== this.pending?.sequence
      ) {
        this.stop('invalid-content');
        return;
      }
      if (this.pending && reply.commandSequence === this.pending.sequence) {
        this.acknowledged = reply.commandSequence;
        this.pending = undefined;
        clearTimeout(this.action);
        this.action = undefined;
      }
      this.ready = true;
      clearTimeout(this.startup);
      this.startup = undefined;
      this.armLiveness();
      this.onSnapshot?.(reply);
      this.flush();
    } catch {
      this.stop('invalid-content');
    }
  };

  private flush(): void {
    if (
      this.closed ||
      !this.ready ||
      this.pending ||
      !this.port ||
      this.dispatch !== undefined ||
      this.queue.length === 0
    )
      return;
    const now = performance.now();
    while (this.dispatchTimes.length && (this.dispatchTimes[0] ?? now) < now - 1000)
      this.dispatchTimes.shift();
    const oldest = this.dispatchTimes[0];
    if (
      this.dispatchTimes.length >= GENUI_EXECUTION_LIMITS.commandMessagesPerSecond &&
      oldest !== undefined
    ) {
      this.dispatch = setTimeout(
        () => {
          this.dispatch = undefined;
          this.flush();
        },
        Math.max(1, Math.ceil(oldest + 1001 - now)),
      );
      return;
    }
    const command = this.queue.shift();
    if (!command) return;
    this.dispatchTimes.push(now);
    this.pending = command;
    this.action = setTimeout(() => this.stop('execution'), GENUI_EXECUTION_LIMITS.commandTimeoutMs);
    try {
      this.port.send(command);
    } catch {
      this.stop('execution');
    }
  }

  private armLiveness(): void {
    clearTimeout(this.liveness);
    this.liveness = setTimeout(
      () => this.stop('execution'),
      GENUI_EXECUTION_LIMITS.heartbeatTimeoutMs,
    );
  }

  private stop(reason: GenuiExecutionFailure | undefined): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.startup);
    clearTimeout(this.liveness);
    clearTimeout(this.action);
    clearTimeout(this.dispatch);
    this.startup = undefined;
    this.liveness = undefined;
    this.action = undefined;
    this.dispatch = undefined;
    this.dispatchTimes.length = 0;
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    const port = this.port;
    this.port = undefined;
    this.document = undefined;
    this.queue.length = 0;
    this.pending = undefined;
    this.onSnapshot = undefined;
    const stopped = this.onStopped;
    this.onStopped = undefined;
    try {
      unsubscribe?.();
    } finally {
      try {
        port?.terminate(reason);
      } finally {
        stopped?.(reason);
      }
    }
  }
}
