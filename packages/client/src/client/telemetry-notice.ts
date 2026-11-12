import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store';

import type { BridgeCall } from './bridge.js';
import type { HostAcknowledgements } from './host-acknowledgements.js';
import type { ConfigStorage } from './roster-config.js';

export const TELEMETRY_NOTICE_SEEN_KEY = 'botharness.telemetryNotice.seen';
const TELEMETRY_NOTICE_ACK = 'telemetry-notice';

export interface TelemetryNoticeSnapshot {
  open: boolean;
}

function seen(storage: ConfigStorage | undefined): boolean {
  try {
    return storage?.getItem(TELEMETRY_NOTICE_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export class TelemetryNoticeController {
  readonly source: SnapshotStore<TelemetryNoticeSnapshot>;

  private readonly call: BridgeCall;
  private readonly storage: ConfigStorage | undefined;
  private readonly settings: (() => void) | undefined;
  private started: Promise<void> | undefined;

  constructor(
    call: BridgeCall,
    storage: ConfigStorage | undefined,
    openSettings?: () => void,
    private readonly acks?: HostAcknowledgements,
  ) {
    this.call = call;
    this.storage = storage;
    this.settings = openSettings;
    this.source = createSnapshotStore<TelemetryNoticeSnapshot>({ open: false });
  }

  start(after?: Promise<unknown>): Promise<void> {
    this.started ??= this.check(after).catch((error: unknown) => {
      this.started = undefined;
      console.warn('botharness: failed to read telemetry status', error);
    });
    return this.started;
  }

  dismiss(): void {
    try {
      this.storage?.setItem(TELEMETRY_NOTICE_SEEN_KEY, '1');
    } catch {
      console.warn('botharness: failed to remember the telemetry notice');
    }
    this.acks?.record(TELEMETRY_NOTICE_ACK, '1');
    this.source.update((draft) => {
      draft.open = false;
    });
  }

  get canOpenSettings(): boolean {
    return this.settings !== undefined;
  }

  openSettings(): void {
    this.dismiss();
    this.settings?.();
  }

  private async check(after: Promise<unknown> | undefined): Promise<void> {
    if (seen(this.storage)) {
      if (this.acks !== undefined)
        void this.acks
          .load()
          .then(() => this.acks?.value(TELEMETRY_NOTICE_ACK, TELEMETRY_NOTICE_SEEN_KEY));
      return;
    }
    if (this.acks !== undefined) {
      await this.acks.load();
      if (this.acks.value(TELEMETRY_NOTICE_ACK, TELEMETRY_NOTICE_SEEN_KEY) === '1') return;
    }
    await after?.catch(() => undefined);
    const result = await this.call('telemetryStatus', {});
    if (!result.ok) throw new Error(result.error.message);
    const value = result.value;
    const enabled =
      typeof value === 'object' &&
      value !== null &&
      (value as Record<string, unknown>)['enabled'] === true;
    if (!enabled) return;
    this.source.update((draft) => {
      draft.open = true;
    });
  }
}
