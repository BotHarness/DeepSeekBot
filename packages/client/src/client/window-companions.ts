import { parseActivitySnapshot } from './activity-live.js';
import type { PersonaBotActivitySnapshot } from './store.js';
import type { ConfigStorage } from './roster-config.js';
import {
  companionSources,
  companionSourceEnabled,
  type CompanionEpochs,
} from '../../../core/src/companions/sources.js';
import {
  WindowCompanion,
  type CompanionSelection,
  type CompanionStream,
} from './window-companion.js';

export interface CompanionCapacity {
  layers: number;
  retention: number;
}
interface SubscriptionUpdate {
  consumerId: string;
  selections: {
    botId: string;
    dm: boolean;
    group: boolean;
    visibility: CompanionSelection['visibility'];
    epochs: CompanionEpochs;
  }[];
  capacity: number;
  revision: number;
}
interface Dependencies {
  storage?: ConfigStorage | undefined;
  context(): Promise<{ profileId: string }>;
  exists?(botId: string): Promise<boolean>;
  source(url: string): CompanionStream;
  update(value: SubscriptionUpdate): Promise<void>;
  onActivity?(snapshot: PersonaBotActivitySnapshot): void;
}
interface VirtualStream {
  events: EventTarget;
  dm: boolean;
  group: boolean;
  visibility: CompanionSelection['visibility'];
  ready: boolean;
  revision: number;
  failed: boolean;
  epochs: CompanionEpochs;
}
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
function decode(event: Event): Record<string, unknown> | undefined {
  try {
    if (!(event instanceof MessageEvent)) return undefined;
    return record(typeof event.data === 'string' ? JSON.parse(event.data) : event.data);
  } catch {
    return undefined;
  }
}
function capacity(value: unknown): CompanionCapacity {
  const data = record(value);
  const bound = (value: unknown, fallback: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(1, Math.min(max, Math.floor(value)))
      : fallback;
  const retention = bound(data?.['retention'], 20, 100);
  return { layers: Math.min(retention, bound(data?.['layers'], 3, 10)), retention };
}
function selection(value: unknown): CompanionSelection | undefined {
  const data = record(value);
  if (typeof data?.['botId'] !== 'string' || !data['botId']) return undefined;
  return {
    botId: data['botId'],
    activity: data['activity'] !== false,
    dm: data['dm'] !== false,
    group: data['group'] === true,
    visibility:
      data['visibility'] === 'own-dm' || data['visibility'] === 'all-bot'
        ? data['visibility']
        : 'shared',
    walking: data['walking'] !== false,
    position:
      typeof data['position'] === 'number' && Number.isFinite(data['position'])
        ? Math.max(0, Math.min(1, data['position']))
        : 0.75,
  };
}

export class WindowCompanions {
  private state: {
    ready: boolean;
    companions: readonly WindowCompanion[];
    capacity: CompanionCapacity;
    speechSound: boolean;
    sync: 'connecting' | 'live' | 'stale';
  } = {
    ready: false,
    companions: [],
    capacity: { layers: 3, retention: 20 },
    speechSound: false,
    sync: 'connecting',
  };
  private listeners = new Set<() => void>();
  private children = new Map<string, WindowCompanion>();
  private preferences = new Map<string, CompanionSelection>();
  private streams = new Map<string, VirtualStream>();
  private admissions = new Map<
    string,
    Pick<VirtualStream, 'dm' | 'group' | 'visibility' | 'epochs'>
  >();
  private stream: CompanionStream | undefined;
  private consumerId: string | undefined;
  private generation: string | undefined;
  private recovering = false;
  private profileId: string | undefined;
  private hadSavedPreferences = false;
  private revision = 0;
  private scheduled = false;
  private sending = false;
  private dirty = false;
  private controlFailed = false;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private resumeConsumerId: string | undefined;
  private disposed = false;
  constructor(private readonly deps: Dependencies) {}
  getSnapshot = () => this.state;
  subscribe = (changed: () => void): (() => void) => {
    this.listeners.add(changed);
    return () => {
      this.listeners.delete(changed);
    };
  };
  get(botId: string): WindowCompanion | undefined {
    return this.children.get(botId);
  }
  private notify(): void {
    this.state = { ...this.state, companions: [...this.children.values()] };
    for (const changed of this.listeners) changed();
  }
  async start(): Promise<void> {
    try {
      const { profileId } = await this.deps.context();
      if (this.disposed || this.state.ready || !profileId) return;
      this.profileId = profileId;
      let selections: unknown[] = [];
      try {
        const raw = this.deps.storage?.getItem(this.key);
        const data = raw ? record(JSON.parse(raw)) : undefined;
        this.hadSavedPreferences = raw !== null && raw !== undefined;
        if (data) {
          selections = Array.isArray(data['selections']) ? data['selections'] : [];
          this.state = {
            ...this.state,
            capacity: capacity(data['capacity']),
            speechSound: data['speechSound'] === true,
          };
        } else {
          const legacy = this.deps.storage?.getItem(`botharness/companions/v1/${profileId}`);
          this.hadSavedPreferences ||= Boolean(legacy);
          selections = legacy ? [JSON.parse(legacy)] : [];
        }
      } catch {}
      this.state = { ...this.state, ready: true };
      for (const raw of selections) {
        const selected = selection(raw);
        if (selected && !this.children.has(selected.botId)) this.add(selected);
      }
      this.notify();
      this.save();
    } catch {
      if (!this.disposed) {
        this.state = { ...this.state, sync: 'stale' };
        this.notify();
      }
    }
  }
  initializeDefault(botId: string): void {
    if (!this.state.ready || this.disposed || !this.profileId) return;
    const key = `botharness/companions/default-initialized/${this.profileId}`;
    try {
      if (this.deps.storage?.getItem(key)) return;
      this.deps.storage?.setItem(key, '1');
    } catch {
      return;
    }
    if (!this.hadSavedPreferences && this.children.size === 0) this.select(botId);
  }
  select(botId: string): void {
    if (!this.state.ready || this.disposed || !botId || this.children.has(botId)) return;
    this.add({
      botId,
      activity: true,
      dm: true,
      group: false,
      visibility: 'shared',
      walking: true,
      position: Math.max(0.1, 0.75 - (this.children.size % 4) * 0.2),
    });
    this.notify();
    this.save();
  }
  private add(selected: CompanionSelection): void {
    this.preferences.set(selected.botId, selected);
    const child = new WindowCompanion({
      initialSelection: selected,
      context: async () => ({ profileId: this.profileId! }),
      ...(this.deps.exists ? { exists: this.deps.exists } : {}),
      source: (url) => this.open(url),
      onSelection: (value) => {
        if (!value) {
          this.remove(selected.botId);
          return;
        }
        this.preferences.set(selected.botId, value);
        this.save();
        this.notify();
      },
    });
    child.setCapacity(this.state.capacity);
    this.children.set(selected.botId, child);
    void child.start();
  }
  remove(botId: string): void {
    this.children.get(botId)?.dispose();
    this.children.delete(botId);
    this.preferences.delete(botId);
    this.admissions.delete(botId);
    if (!this.children.size) {
      this.resetRetry();
      this.resetReconnect();
      this.resumeConsumerId = undefined;
      this.stream?.close();
      this.stream = undefined;
      this.consumerId = undefined;
    }
    this.notify();
    this.save();
  }
  configureCapacity(value: CompanionCapacity): void {
    this.revision++;
    this.state = { ...this.state, capacity: capacity(value) };
    for (const child of this.children.values()) child.setCapacity(this.state.capacity);
    this.schedule();
    this.save();
    this.notify();
  }
  configureSpeechSound(enabled: boolean): void {
    if (!this.state.ready || this.disposed || this.state.speechSound === enabled) return;
    this.state = { ...this.state, speechSound: enabled };
    this.save();
    this.notify();
  }
  private get key(): string {
    return `botharness/companions/v2/${this.profileId}`;
  }
  private save(): void {
    if (!this.profileId || this.disposed) return;
    try {
      this.deps.storage?.setItem(
        this.key,
        JSON.stringify({
          selections: [...this.preferences.values()],
          capacity: this.state.capacity,
          speechSound: this.state.speechSound,
        }),
      );
    } catch {}
  }
  private open(url: string): CompanionStream {
    const query = new URL(url, 'http://localhost').searchParams;
    const botId = query.get('botId')!;
    const virtual: VirtualStream = {
      events: new EventTarget(),
      dm: query.get('dm') !== '0',
      group: query.get('group') === '1',
      visibility:
        query.get('visibility') === 'own-dm'
          ? 'own-dm'
          : query.get('visibility') === 'all-bot'
            ? 'all-bot'
            : 'shared',
      ready: false,
      revision: ++this.revision,
      failed: false,
      epochs: {
        'own-dm': this.revision,
        'bot-dm': this.revision,
        'shared-group': this.revision,
        'bot-group': this.revision,
      },
    };
    const previous = this.admissions.get(botId);
    if (previous) {
      virtual.epochs = { ...previous.epochs };
      for (const source of companionSources)
        if (companionSourceEnabled(source, previous) !== companionSourceEnabled(source, virtual))
          virtual.epochs[source] = this.revision;
    }
    this.admissions.set(botId, virtual);
    this.streams.set(botId, virtual);
    if (!this.stream) {
      try {
        this.connect();
      } catch (error) {
        this.streams.delete(botId);
        this.state = { ...this.state, sync: 'stale' };
        this.notify();
        throw error;
      }
    }
    this.schedule();
    const currentState = (): number => (virtual.failed ? 2 : (this.stream?.readyState ?? 0));
    return {
      get readyState() {
        return currentState();
      },
      addEventListener: (name, listener) => virtual.events.addEventListener(name, listener),
      close: () => {
        if (this.streams.get(botId) !== virtual) return;
        this.streams.delete(botId);
        this.revision++;
        this.schedule();
      },
    };
  }
  private connect(): void {
    const stream = this.deps.source(
      `./api/botharness/companion?subscribe=1${this.resumeConsumerId ? `&resume=${encodeURIComponent(this.resumeConsumerId)}` : ''}`,
    );
    this.stream = stream;
    const snapshot = (event: Event, baseline: boolean) => {
      if (this.disposed || this.stream !== stream) return;
      const value = decode(event);
      const activity = parseActivitySnapshot(JSON.stringify(value?.['activity']));
      if (
        !value ||
        value['profileId'] !== this.profileId ||
        typeof value['consumerId'] !== 'string' ||
        !Array.isArray(value['bots']) ||
        !activity
      )
        return;
      if (baseline) {
        this.recovering = value['recovered'] === true && this.generation === activity.generation;
        this.generation = activity.generation;
        this.consumerId = value['consumerId'];
        this.resumeConsumerId = this.consumerId;
        this.resetReconnect();
        for (const child of this.streams.values()) child.ready = false;
        this.schedule();
      } else if (value['consumerId'] !== this.consumerId) return;
      if (
        typeof value['selectionRevision'] === 'number' &&
        value['selectionRevision'] >= this.revision
      ) {
        this.controlFailed = false;
        this.resetRetry();
      }
      const acknowledgedRevision = this.revision;
      if (Array.isArray(value['removedBotIds']))
        for (const id of value['removedBotIds']) {
          const child = typeof id === 'string' ? this.streams.get(id) : undefined;
          if (
            child &&
            typeof value['selectionRevision'] === 'number' &&
            value['selectionRevision'] >= acknowledgedRevision
          )
            this.remove(id);
        }
      this.deps.onActivity?.(activity);
      this.state = { ...this.state, sync: this.controlFailed ? 'stale' : 'live' };
      this.notify();
      const activityByBot = new Map(activity.bots.map((item) => [item.slug, item]));
      for (const bot of value['bots']) {
        const data = record(bot);
        if (typeof data?.['slug'] !== 'string') continue;
        const child = this.streams.get(data['slug']);
        if (
          !child ||
          (typeof value['selectionRevision'] === 'number' &&
            value['selectionRevision'] < child.revision)
        )
          continue;
        const name = child.ready ? 'companion/activity' : 'companion/baseline';
        child.ready = true;
        child.failed = false;
        child.events.dispatchEvent(
          new MessageEvent(name, {
            data: JSON.stringify({
              profileId: this.profileId,
              recovered: this.recovering,
              bot,
              activity: {
                ...activity,
                bots: activityByBot.has(data['slug']) ? [activityByBot.get(data['slug'])!] : [],
              },
            }),
          }),
        );
      }
    };
    stream.addEventListener('companion/baseline', (event) => snapshot(event, true));
    stream.addEventListener('companion/selection', (event) => snapshot(event, false));
    stream.addEventListener('companion/activity', (event) => snapshot(event, false));
    stream.addEventListener('companion/message', (event) => {
      if (this.disposed || this.stream !== stream) return;
      const value = decode(event);
      if (typeof value?.['botId'] === 'string')
        this.streams
          .get(value['botId'])
          ?.events.dispatchEvent(
            new MessageEvent('companion/message', { data: JSON.stringify(value) }),
          );
    });
    stream.addEventListener('error', () => {
      if (this.disposed || this.stream !== stream) return;
      this.consumerId = undefined;
      this.resetRetry();
      this.state = { ...this.state, sync: 'stale' };
      for (const child of this.streams.values()) child.events.dispatchEvent(new Event('error'));
      this.notify();
      if (stream.readyState === 2) this.scheduleReconnect();
    });
  }
  private schedule(): void {
    this.resetRetry();
    this.dirty = true;
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.streams.size) {
        this.resetReconnect();
        this.resumeConsumerId = undefined;
        this.stream?.close();
        this.stream = undefined;
        this.consumerId = undefined;
        return;
      }
      void this.send();
    });
  }
  private async send(): Promise<void> {
    if (this.sending || !this.consumerId || this.disposed) return;
    this.sending = true;
    const stream = this.stream;
    let consumerId = this.consumerId;
    try {
      while (this.dirty && this.consumerId && this.stream === stream && !this.disposed) {
        this.dirty = false;
        consumerId = this.consumerId;
        await this.deps.update({
          consumerId,
          selections: [...this.streams].map(([botId, item]) => ({
            botId,
            dm: item.dm,
            group: item.group,
            visibility: item.visibility,
            epochs: item.epochs,
          })),
          capacity: this.state.capacity.retention,
          revision: this.revision,
        });
      }
    } catch {
      if (!this.disposed && this.stream === stream && this.consumerId === consumerId) {
        this.controlFailed = true;
        this.state = { ...this.state, sync: 'stale' };
        for (const child of this.streams.values()) {
          child.failed = true;
          child.events.dispatchEvent(new Event('error'));
        }
        this.notify();
        if (this.retryAttempt < 2) {
          this.retryTimer = setTimeout(
            () => {
              this.retryTimer = undefined;
              this.dirty = true;
              void this.send();
            },
            [250, 1000][this.retryAttempt++]!,
          );
        }
      }
    } finally {
      this.sending = false;
      if (this.dirty && this.consumerId) void this.send();
    }
  }
  private resetRetry(): void {
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryAttempt = 0;
  }
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== undefined || this.disposed || !this.streams.size) return;
    const stream = this.stream;
    const delay = Math.min(8000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt = Math.min(3, this.reconnectAttempt + 1);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.disposed || !this.streams.size || this.stream !== stream) return;
      stream?.close();
      try {
        this.connect();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }
  private resetReconnect(): void {
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.reconnectAttempt = 0;
  }
  reconnect(): void {
    const stream = this.stream;
    if (this.disposed || stream === undefined) return;
    this.resetReconnect();
    stream.close();
    try {
      this.connect();
    } catch {
      this.scheduleReconnect();
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resetRetry();
    this.resetReconnect();
    this.resumeConsumerId = undefined;
    for (const child of this.children.values()) child.dispose();
    this.stream?.close();
    this.stream = undefined;
    this.children.clear();
    this.streams.clear();
    this.admissions.clear();
    this.listeners.clear();
  }
}
