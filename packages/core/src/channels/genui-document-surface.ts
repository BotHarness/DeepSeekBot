import {
  genuiDocumentIdentity,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';
import { GENUI_DOCUMENT_POLICY_VERSION } from './genui-document-policy.js';
import { GenuiExecutionSupervisor } from './genui-execution-supervisor.js';
import type { GenuiExecutionFailure } from './genui-execution.js';
import { GenuiMirrorFrame } from './genui-mirror-frame.js';
import { createGenuiWorkerPort } from './genui-worker-port.js';

export class GenuiDocumentSurface {
  readonly ready: Promise<void>;
  private frame: GenuiMirrorFrame | undefined;
  private supervisor: GenuiExecutionSupervisor | undefined;
  private closed = false;
  private stateIdentity: string;
  private stateValue: GenuiDocumentState;
  private themeValue: 'light' | 'dark';
  private resolve: (() => void) | undefined;
  private reject: ((error: Error) => void) | undefined;
  private onState: ((state: GenuiDocumentState) => void) | undefined;
  private onFailure: ((reason: GenuiExecutionFailure) => void) | undefined;

  constructor(
    container: HTMLElement,
    options: {
      document: GenuiDocument;
      state: GenuiDocumentState;
      theme: 'light' | 'dark';
      textScale?: number;
      instanceId: string;
      generation: number;
      workerSource: string;
      onState: (state: GenuiDocumentState) => void;
      onHeight: (height: number) => void;
      onFailure: (reason: GenuiExecutionFailure) => void;
    },
  ) {
    this.stateIdentity = JSON.stringify(options.state);
    this.stateValue = options.state;
    this.themeValue = options.theme;
    this.onState = options.onState;
    this.onFailure = options.onFailure;
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    try {
      const frame = new GenuiMirrorFrame(container, {
        title: options.document.title,
        theme: options.theme,
        textScale: options.textScale ?? 1,
        onCommand: (command) => this.supervisor?.send(command),
        onHeight: options.onHeight,
        onFailure: (reason) => this.fail(reason),
      });
      frame.frame.dataset['documentId'] = genuiDocumentIdentity(options.document);
      frame.frame.dataset['policyVersion'] = GENUI_DOCUMENT_POLICY_VERSION;
      this.frame = frame;
      void frame.ready.then(
        () => {
          if (this.closed) return;
          this.supervisor = new GenuiExecutionSupervisor({
            instanceId: options.instanceId,
            generation: options.generation,
            document: options.document,
            state: this.stateValue,
            theme: this.themeValue,
            createPort: () => createGenuiWorkerPort(options.workerSource),
            onSnapshot: (snapshot) => {
              if (this.closed || !frame.paint(snapshot, this.supervisor?.pendingControlIds)) return;
              const identity = JSON.stringify(snapshot.state);
              if (identity !== this.stateIdentity) {
                this.stateIdentity = identity;
                this.stateValue = snapshot.state;
                this.onState?.(snapshot.state);
              }
              this.resolve?.();
              this.resolve = undefined;
              this.reject = undefined;
            },
            onStopped: (reason) => {
              if (reason !== undefined) this.fail(reason);
            },
          });
        },
        () => this.fail('unsupported'),
      );
    } catch {
      this.fail('unsupported');
    }
  }

  restore(state: GenuiDocumentState): void {
    if (this.closed || JSON.stringify(state) === this.stateIdentity) return;
    this.stateValue = state;
    if (!this.supervisor) this.stateIdentity = JSON.stringify(state);
    this.supervisor?.send({ type: 'restore', state });
  }

  theme(theme: 'light' | 'dark'): void {
    if (this.closed) return;
    this.themeValue = theme;
    this.frame?.theme(theme);
    this.supervisor?.send({ type: 'theme', theme });
  }

  textScale(scale: number): void {
    if (!this.closed) this.frame?.textScale(scale);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.onState = undefined;
    this.onFailure = undefined;
    this.resolve = undefined;
    this.reject?.(new Error('GenUI document surface was disposed.'));
    this.reject = undefined;
    try {
      this.supervisor?.dispose();
    } finally {
      this.supervisor = undefined;
      this.frame?.dispose();
      this.frame = undefined;
    }
  }

  private fail(reason: GenuiExecutionFailure): void {
    if (this.closed) return;
    const failure = this.onFailure;
    this.dispose();
    failure?.(reason);
  }
}
