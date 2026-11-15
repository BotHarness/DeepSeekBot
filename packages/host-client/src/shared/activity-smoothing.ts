export interface SmoothedActivity {
  state: string;
  activity?: unknown;
}

export const ACTIVITY_SETTLE_MS = 700;
export const ACTIVITY_IDLE_SETTLE_MS = 900;
export const ACTIVITY_HOLD_MS = 1500;
export const ACTIVITY_DETAIL_MS = 1500;

const URGENT = new Set<string>(['waiting', 'blocked']);

interface Track<Entry extends SmoothedActivity> {
  state: Entry['state'];
  activity: Entry['activity'];
  shownAt: number;
  detailAt: number;
  pending: Entry['state'] | undefined;
  pendingSince: number;
}

const sameActivity = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export class ActivitySmoother<Entry extends SmoothedActivity = SmoothedActivity> {
  #tracks = new Map<string, Track<Entry>>();

  step(
    raw: ReadonlyMap<string, Entry>,
    now: number,
  ): { shown: Map<string, Entry>; wake: number | undefined } {
    const shown = new Map<string, Entry>();
    let wake: number | undefined;
    const later = (at: number) => {
      if (wake === undefined || at < wake) wake = at;
    };
    for (const slug of this.#tracks.keys()) if (!raw.has(slug)) this.#tracks.delete(slug);
    for (const [slug, entry] of raw) {
      let track = this.#tracks.get(slug);
      if (!track) {
        track = {
          state: entry.state,
          activity: entry.activity,
          shownAt: now,
          detailAt: now,
          pending: undefined,
          pendingSince: now,
        };
        this.#tracks.set(slug, track);
      } else if (entry.state === track.state) {
        track.pending = undefined;
        if (entry.state !== 'working' || track.activity === undefined) {
          if (!sameActivity(track.activity, entry.activity)) track.detailAt = now;
          track.activity = entry.activity;
        } else if (!sameActivity(track.activity, entry.activity)) {
          if (now - track.detailAt >= ACTIVITY_DETAIL_MS) {
            track.activity = entry.activity;
            track.detailAt = now;
          } else later(track.detailAt + ACTIVITY_DETAIL_MS);
        }
      } else if (URGENT.has(entry.state) || URGENT.has(track.state) || track.state === 'idle') {
        Object.assign(track, {
          state: entry.state,
          activity: entry.activity,
          shownAt: now,
          detailAt: now,
          pending: undefined,
        });
      } else {
        if (track.pending !== entry.state) {
          track.pending = entry.state;
          track.pendingSince = now;
        }
        const settle = entry.state === 'idle' ? ACTIVITY_IDLE_SETTLE_MS : ACTIVITY_SETTLE_MS;
        const ready = Math.max(track.pendingSince + settle, track.shownAt + ACTIVITY_HOLD_MS);
        if (now >= ready)
          Object.assign(track, {
            state: entry.state,
            activity: entry.activity,
            shownAt: now,
            detailAt: now,
            pending: undefined,
          });
        else later(ready);
      }
      const { activity: _raw, ...rest } = entry;
      shown.set(slug, {
        ...rest,
        state: track.state,
        ...(track.state === 'working' && track.activity !== undefined
          ? { activity: track.activity }
          : {}),
      } as Entry);
    }
    return { shown, wake };
  }
}
