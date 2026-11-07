import {
  initialGenuiView,
  validateGenuiView,
  type GenuiReport,
  type GenuiReply,
  type GenuiView,
  type GenuiViewState,
} from '../../../core/src/channels/genui.js';

type ViewStatus =
  | 'loading'
  | 'ready'
  | 'saving'
  | 'load-error'
  | 'save-error'
  | 'conflict'
  | 'resolving'
  | 'conflict-ready';
interface ViewActions {
  genuiView(channelId: string, messageId: string): Promise<GenuiView>;
  saveGenuiView(
    channelId: string,
    messageId: string,
    snapshotId: string,
    version: number,
    state: GenuiViewState,
  ): Promise<GenuiView>;
}
interface SubmissionAttempt {
  payload: string;
  id: string;
  sent: boolean;
}
const retainedViews = new WeakMap<ViewActions, Map<string, GenuiPrivateView>>();

export function getGenuiPrivateView(
  report: GenuiReport,
  channelId: string,
  messageId: string,
  actions?: ViewActions,
): GenuiPrivateView {
  if (!actions) return new GenuiPrivateView(report, channelId, messageId);
  const cache = retainedViews.get(actions) ?? new Map<string, GenuiPrivateView>();
  retainedViews.set(actions, cache);
  const key = JSON.stringify([channelId, messageId, report.snapshotId]);
  const existing = cache.get(key);
  if (existing) return existing;
  if (cache.size >= 32) {
    const disposable = [...cache].find(([, view]) => view.disposable());
    if (!disposable)
      throw new Error('Private report draft capacity reached. Save or reset an existing draft.');
    cache.delete(disposable[0]);
  }
  const view = new GenuiPrivateView(report, channelId, messageId, actions);
  cache.set(key, view);
  return view;
}

export class GenuiPrivateView {
  private snapshot: {
    state: GenuiViewState;
    status: ViewStatus;
    sendStatus: 'idle' | 'sending' | 'sent' | 'error';
  };
  readonly attempts: Record<GenuiReply['intent'], SubmissionAttempt | undefined> = {
    continue: undefined,
    refresh: undefined,
  };
  private listeners = new Set<() => void>();
  private version = 0;
  private changed = 0;
  private saved = 0;
  private generation = 0;
  private pending = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private report: GenuiReport,
    private channelId: string,
    private messageId: string,
    private actions?: ViewActions,
  ) {
    this.snapshot = {
      state: initialGenuiView(),
      status: actions ? 'loading' : 'ready',
      sendStatus: 'idle',
    };
  }

  getSnapshot = () => this.snapshot;
  isActive = () => this.listeners.size > 0;
  disposable = () =>
    !this.isActive() &&
    this.changed === this.saved &&
    this.snapshot.sendStatus !== 'error' &&
    this.snapshot.sendStatus !== 'sending';
  setSendStatus = (sendStatus: 'idle' | 'sending' | 'sent' | 'error') => {
    this.snapshot = { ...this.snapshot, sendStatus };
    for (const listener of this.listeners) listener();
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) void this.load(false);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.generation++;
        this.pending = false;
        clearTimeout(this.timer);
      }
    };
  };

  private update(status: ViewStatus, state = this.snapshot.state) {
    this.snapshot = { ...this.snapshot, status, state };
    for (const listener of this.listeners) listener();
    clearTimeout(this.timer);
    if (this.isActive() && this.actions && status === 'ready' && this.changed !== this.saved)
      this.timer = setTimeout(() => {
        void this.save();
      }, 600);
  }

  edit = (next: GenuiViewState) => {
    const state = validateGenuiView(this.report, next);
    this.changed++;
    this.update(this.snapshot.status, state);
  };

  reload = () => this.load(true);
  reset = () => this.edit(initialGenuiView());
  private load = async (discard: boolean) => {
    const current = ++this.generation;
    if (!this.actions) return;
    this.pending = true;
    this.update('loading');
    try {
      const view = await this.actions.genuiView(this.channelId, this.messageId);
      if (this.generation !== current) return;
      const state = validateGenuiView(this.report, view.state);
      if (
        !discard &&
        this.changed !== this.saved &&
        JSON.stringify(state) !== JSON.stringify(this.snapshot.state)
      ) {
        this.update(view.version === this.version ? 'ready' : 'conflict');
        return;
      }
      this.version = view.version;
      this.changed = this.saved = 0;
      this.update('ready', state);
    } catch (error) {
      if (this.generation === current) {
        if (error instanceof Error && 'code' in error && error.code === 'genui-unavailable') {
          this.changed = this.saved = 0;
          this.attempts.continue = this.attempts.refresh = undefined;
          this.snapshot = { ...this.snapshot, sendStatus: 'idle' };
          this.update('load-error', initialGenuiView());
        } else this.update('load-error');
      }
    } finally {
      if (this.generation === current) this.pending = false;
    }
  };

  save = async () => {
    if (!this.actions || this.pending || this.changed === this.saved) return;
    this.pending = true;
    const current = this.generation;
    const savingRevision = this.changed;
    const state = this.snapshot.state;
    this.update('saving');
    try {
      const view = await this.actions.saveGenuiView(
        this.channelId,
        this.messageId,
        this.report.snapshotId,
        this.version,
        state,
      );
      if (this.generation !== current) return;
      validateGenuiView(this.report, view.state);
      this.version = view.version;
      this.saved = savingRevision;
      this.update('ready');
    } catch (error) {
      if (this.generation === current)
        this.update(
          error instanceof Error && 'code' in error && error.code === 'genui-view-conflict'
            ? 'conflict'
            : 'save-error',
        );
    } finally {
      if (this.generation === current) this.pending = false;
    }
  };

  keepDraft = async () => {
    if (!this.actions || this.pending) return;
    const current = this.generation;
    this.pending = true;
    this.update('resolving');
    try {
      const view = await this.actions.genuiView(this.channelId, this.messageId);
      if (this.generation !== current) return;
      validateGenuiView(this.report, view.state);
      this.version = view.version;
      this.update('conflict-ready');
    } catch {
      if (this.generation === current) this.update('conflict');
    } finally {
      if (this.generation === current) this.pending = false;
    }
  };
}
