import {
  GenuiDomMirror,
  GenuiMirrorError,
  GENUI_MIRROR_CSP,
  GENUI_MIRROR_SHELL,
} from './genui-dom-mirror.js';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';
import type {
  GenuiExecutionCommand,
  GenuiExecutionSnapshot,
} from './genui-execution-supervisor.js';
import type { GenuiExecutionFailure } from './genui-execution.js';

export function genuiMirrorHeight(document: Document): number {
  const rectangle = document.body.getBoundingClientRect();
  const height = Math.ceil(
    Math.max(
      GENUI_EXECUTION_LIMITS.mirrorMinHeight,
      document.body.scrollHeight,
      rectangle.height,
      rectangle.bottom + (document.defaultView?.scrollY ?? 0),
    ),
  );
  if (!Number.isFinite(height) || height > GENUI_EXECUTION_LIMITS.mirrorMaxHeight)
    throw new GenuiMirrorError('resource', 'Document height budget exceeded.');
  return height;
}

export class GenuiMirrorFrame {
  readonly frame: HTMLIFrameElement;
  readonly ready: Promise<void>;
  private mirror: GenuiDomMirror | undefined;
  private closed = false;
  private settle: (() => void) | undefined;
  private reject: ((error: GenuiMirrorError) => void) | undefined;
  private startup: ReturnType<typeof setTimeout> | undefined;
  private animation: number | undefined;
  private mutations: MutationObserver | undefined;
  private resize: ResizeObserver | undefined;
  private height: number = GENUI_EXECUTION_LIMITS.mirrorMinHeight;
  private writes = 0;
  private width = 0;
  private measured = false;
  private onCommand: ((command: GenuiExecutionCommand) => void) | undefined;
  private onHeight: ((height: number) => void) | undefined;
  private onFailure: ((reason: GenuiExecutionFailure) => void) | undefined;
  private themeValue: 'light' | 'dark';
  private readonly owner: Window & typeof globalThis;

  constructor(
    container: HTMLElement,
    options: {
      title: string;
      theme: 'light' | 'dark';
      onCommand: (command: GenuiExecutionCommand) => void;
      onHeight: (height: number) => void;
      onFailure: (reason: GenuiExecutionFailure) => void;
    },
  ) {
    const owner = container.ownerDocument.defaultView;
    if (
      !owner ||
      typeof owner.requestAnimationFrame !== 'function' ||
      typeof owner.MutationObserver !== 'function' ||
      typeof owner.ResizeObserver !== 'function'
    )
      throw new GenuiMirrorError('unsupported', 'A bounded document frame is unavailable.');
    this.owner = owner;
    this.themeValue = options.theme;
    this.onCommand = options.onCommand;
    this.onHeight = options.onHeight;
    this.onFailure = options.onFailure;
    this.frame = container.ownerDocument.createElement('iframe');
    this.frame.title = options.title;
    this.frame.setAttribute('sandbox', 'allow-same-origin');
    this.frame.referrerPolicy = 'no-referrer';
    Object.assign(this.frame.style, {
      display: 'block',
      width: '100%',
      height: `${this.height}px`,
      border: '0',
    });
    this.ready = new Promise<void>((resolve, reject) => {
      this.settle = resolve;
      this.reject = reject;
    });
    this.frame.addEventListener('load', this.loaded);
    this.frame.addEventListener('error', this.failed);
    this.startup = setTimeout(() => this.fail('startup'), GENUI_EXECUTION_LIMITS.mirrorStartupMs);
    this.frame.srcdoc = GENUI_MIRROR_SHELL;
    container.append(this.frame);
  }

  paint(snapshot: GenuiExecutionSnapshot, preserveControls?: ReadonlySet<string>): boolean {
    if (this.closed) return false;
    if (!this.mirror) throw new GenuiMirrorError('unsupported', 'Document frame is not ready.');
    try {
      this.mirror.paint(snapshot, preserveControls);
      this.writes = 0;
      this.schedule();
      return true;
    } catch (error) {
      this.fail(error instanceof GenuiMirrorError ? error.reason : 'invalid-content');
      return false;
    }
  }

  theme(theme: 'light' | 'dark'): void {
    if (this.closed) return;
    this.themeValue = theme;
    this.mirror?.theme(theme);
    this.schedule();
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.startup);
    this.startup = undefined;
    if (this.animation !== undefined) this.owner.cancelAnimationFrame(this.animation);
    this.animation = undefined;
    this.frame.removeEventListener('load', this.loaded);
    this.frame.removeEventListener('error', this.failed);
    this.mutations?.disconnect();
    this.resize?.disconnect();
    this.mutations = undefined;
    this.resize = undefined;
    this.mirror?.dispose();
    this.mirror = undefined;
    this.frame.remove();
    this.reject?.(new GenuiMirrorError('resource', 'Document frame was disposed.'));
    this.reject = undefined;
    this.settle = undefined;
    this.onCommand = undefined;
    this.onHeight = undefined;
    this.onFailure = undefined;
  }

  private loaded = (): void => {
    if (this.closed || this.mirror) return;
    try {
      const document = this.frame.contentDocument;
      if (
        !document?.body ||
        document.head
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content') !== GENUI_MIRROR_CSP
      )
        return;
      this.mirror = new GenuiDomMirror(document, (command) => this.onCommand?.(command));
      this.mirror.theme(this.themeValue);
      this.mutations = new this.owner.MutationObserver(() => {
        this.writes = 0;
        this.schedule();
      });
      this.mutations.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      this.resize = new this.owner.ResizeObserver(() => {
        const width = this.frame.getBoundingClientRect().width;
        if (width !== this.width) {
          this.width = width;
          this.writes = 0;
        }
        this.schedule();
      });
      this.resize.observe(document.documentElement);
      this.resize.observe(document.body);
      clearTimeout(this.startup);
      this.startup = undefined;
      this.settle?.();
      this.settle = undefined;
      this.reject = undefined;
      this.schedule();
    } catch {
      this.fail('unsupported');
    }
  };

  private failed = (): void => this.fail('unsupported');

  private schedule(): void {
    if (this.closed || !this.mirror || this.animation !== undefined) return;
    this.animation = this.owner.requestAnimationFrame(() => {
      this.animation = undefined;
      if (this.closed) return;
      try {
        const document = this.frame.contentDocument;
        if (!document?.body) {
          this.fail('unsupported');
          return;
        }
        const height = genuiMirrorHeight(document);
        if (height === this.height) {
          if (!this.measured) {
            this.measured = true;
            this.onHeight?.(height);
          }
          return;
        }
        if (++this.writes > GENUI_EXECUTION_LIMITS.mirrorLayoutPasses) {
          this.fail('resource');
          return;
        }
        this.height = height;
        this.measured = true;
        this.frame.style.height = `${height}px`;
        this.onHeight?.(height);
      } catch (error) {
        this.fail(error instanceof GenuiMirrorError ? error.reason : 'invalid-content');
      }
    });
  }

  private fail(reason: GenuiExecutionFailure): void {
    if (this.closed) return;
    const failed = this.onFailure;
    this.dispose();
    failed?.(reason);
  }
}
