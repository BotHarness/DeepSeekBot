import { useCallback, useRef, useSyncExternalStore } from 'react';
import { reportInvariant } from './diagnostic-log.js';
import { flushSync } from 'react-dom';

const KEEP_RENDERED_VIEWPORTS = 1.5;
const CHUNK_SIZE = 32;

export type TimelineSlot = { index: number; placeholder?: number };

export function timelineSlots(
  keys: readonly string[],
  heights: ReadonlyMap<string, number>,
  rendered: (key: string) => boolean,
): TimelineSlot[] {
  return keys.map((key, index) => {
    const height = heights.get(key);
    return height === undefined || rendered(key) ? { index } : { index, placeholder: height };
  });
}

export type TimelineChunk = { id: string; start: number; end: number };

export function timelineChunks(
  keys: readonly string[],
  previous: ReadonlyMap<string, string>,
  size: number,
): { chunks: TimelineChunk[]; assigned: Map<string, string> } {
  const chunks: TimelineChunk[] = [];
  const assigned = new Map<string, string>();
  const ids = new Set(previous.values());
  const closed = new Set<string>();
  let current: TimelineChunk | undefined;
  keys.forEach((key, index) => {
    const known = previous.get(key);
    if (known !== undefined && current?.id === known) current.end = index + 1;
    else if (known !== undefined && !closed.has(known)) {
      if (current !== undefined) closed.add(current.id);
      current = { id: known, start: index, end: index + 1 };
      chunks.push(current);
    } else if (current !== undefined && current.end - current.start < size) current.end = index + 1;
    else {
      if (current !== undefined) closed.add(current.id);
      const id = ids.has(key) || closed.has(key) ? `${key}#${index}` : key;
      current = { id, start: index, end: index + 1 };
      chunks.push(current);
    }
    assigned.set(key, current.id);
  });
  return { chunks, assigned };
}

export function nearKeys(
  keys: readonly string[],
  heights: ReadonlyMap<string, number>,
  top: number,
  bottom: number,
): Set<string> {
  const near = new Set<string>();
  let y = 0;
  for (const key of keys) {
    const height = heights.get(key);
    if (height === undefined) continue;
    if (y < bottom && y + height > top) near.add(key);
    y += height;
  }
  return near;
}

export function windowKeys(
  keys: readonly string[],
  heights: ReadonlyMap<string, number>,
  top: number,
  bottom: number,
): Set<string> {
  const near = nearKeys(keys, heights, top, bottom);
  if (near.size > 0) return near;
  let total = 0;
  for (const key of keys) total += heights.get(key) ?? 0;
  if (total === 0 || (top < total && bottom > 0)) return near;
  const span = Math.min(Math.max(1, bottom - top), total);
  const start = top >= total ? total - span : 0;
  return nearKeys(keys, heights, start, start + span);
}

function sameKeys(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const key of left) if (!right.has(key)) return false;
  return true;
}

type TimelineView = { seen: ReadonlySet<string>; top: number; bottom: number };

export interface TimelineWindow {
  chunks: TimelineChunk[];
  subscribe(listener: () => void): () => void;
  view(): TimelineView;
  slots(view: TimelineView): TimelineSlot[];
  blockRef(key: string): (node: HTMLElement | null) => void;
  rootRef(node: HTMLElement | null): void;
}

export function knownHeights(
  keys: readonly string[],
  measured: ReadonlyMap<string, number>,
  members: ReadonlyMap<string, readonly string[]>,
  shares: ReadonlyMap<string, number>,
): Map<string, number> {
  const known = new Map<string, number>();
  for (const key of keys) {
    const height = measured.get(key);
    if (height !== undefined) {
      known.set(key, height);
      continue;
    }
    const ids = members.get(key);
    if (ids === undefined || ids.length === 0) continue;
    let total = 0;
    for (const id of ids) {
      const share = shares.get(id);
      if (share === undefined) {
        total = NaN;
        break;
      }
      total += share;
    }
    if (Number.isFinite(total)) known.set(key, total);
  }
  return known;
}

export function useTimelineWindow(
  keys: readonly string[],
  pinned: ReadonlySet<string>,
  members: ReadonlyMap<string, readonly string[]> = new Map(),
): TimelineWindow {
  const measured = useRef(new Map<string, number>());
  const shares = useRef(new Map<string, number>());
  const swept = useRef<{
    keys?: readonly string[];
    members?: ReadonlyMap<string, readonly string[]>;
  }>({});
  const chunked = useRef<{
    keys?: readonly string[];
    assigned: ReadonlyMap<string, string>;
    chunks: TimelineChunk[];
  }>({ assigned: new Map(), chunks: [] });
  const latestMembers = useRef(members);
  latestMembers.current = members;
  const record = (key: string, height: number): void => {
    measured.current.set(key, height);
    const ids = latestMembers.current.get(key);
    if (ids !== undefined && ids.length > 0)
      for (const id of ids) shares.current.set(id, height / ids.length);
  };
  const knownSizes = (): Map<string, number> =>
    knownHeights(latestKeys.current, measured.current, latestMembers.current, shares.current);
  const nodes = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, (node: HTMLElement | null) => void>());
  const root = useRef<HTMLElement | null>(null);
  const latestKeys = useRef(keys);
  latestKeys.current = keys;
  const frame = useRef<number | undefined>(undefined);
  const range = useRef<{ keys: ReadonlySet<string>; top: number; bottom: number }>({
    keys: new Set(),
    top: -Infinity,
    bottom: Infinity,
  });
  const reported = useRef(false);
  const current = useRef<TimelineView>({ seen: new Set(), top: -Infinity, bottom: Infinity });
  const listeners = useRef(new Set<() => void>());
  const latestPinned = useRef(pinned);
  latestPinned.current = pinned;
  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);
  const view = useCallback(() => current.current, []);

  const update = useCallback(() => {
    const element = root.current;
    if (element === null || element.clientHeight === 0) return;
    const order = latestKeys.current;
    const sizes = knownSizes();
    let origin: number | undefined;
    let y = 0;
    for (const key of order) {
      const node = nodes.current.get(key);
      if (node !== undefined) {
        origin = node.offsetTop - y;
        break;
      }
      y += sizes.get(key) ?? 0;
    }
    if (origin === undefined) return;
    const keep = element.clientHeight * KEEP_RENDERED_VIEWPORTS;
    const top = element.scrollTop - origin - keep;
    const bottom = element.scrollTop - origin + element.clientHeight + keep;
    const next = nearKeys(order, sizes, top, bottom);
    if (next.size === 0 && order.length > 0)
      next.add(element.scrollTop > origin ? order[order.length - 1]! : order[0]!);
    if (
      !reported.current &&
      order.length > 0 &&
      order.every((key) => range.current.keys.has(key)) &&
      nearKeys(order, sizes, range.current.top, range.current.bottom).size === 0
    ) {
      reported.current = true;
      reportInvariant('timeline-window-lost-groups', 'timeline window lost its rendered groups', {
        groups: order.length,
        measured: order.filter((key) => sizes.has(key)).length,
        rendered: nodes.current.size,
        previous: { top: range.current.top, bottom: range.current.bottom },
        next: { top, bottom },
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
    }
    range.current = { keys: new Set(order), top, bottom };
    const shown = current.current;
    if (
      sameKeys(windowKeys(order, sizes, shown.top, shown.bottom), next) &&
      sameKeys(shown.seen, new Set(order))
    )
      return;
    current.current = { seen: new Set(order), top, bottom };
    for (const listener of listeners.current) listener();
  }, []);

  const schedule = useCallback(() => {
    if (frame.current !== undefined) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = undefined;
      update();
    });
  }, [update]);

  const resize = useRef<ResizeObserver | undefined>(undefined);
  const observer = (): ResizeObserver | undefined => {
    if (resize.current === undefined && typeof ResizeObserver !== 'undefined')
      resize.current = new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          if (entry.target === root.current) {
            changed = true;
            continue;
          }
          const key = (entry.target as HTMLElement).dataset['groupKey'];
          if (key === undefined || !entry.target.isConnected) continue;
          const height =
            entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
          if (height > 0 && measured.current.get(key) !== height) {
            record(key, height);
            changed = true;
          }
        }
        if (changed) schedule();
      });
    return resize.current;
  };

  const blockRef = (key: string): ((node: HTMLElement | null) => void) => {
    let ref = refs.current.get(key);
    if (ref === undefined) {
      ref = (node) => {
        const previous = nodes.current.get(key);
        if (previous !== undefined) {
          observer()?.unobserve(previous);
          nodes.current.delete(key);
        }
        if (node === null) return;
        nodes.current.set(key, node);
        const height = node.getBoundingClientRect().height;
        if (height > 0) record(key, height);
        observer()?.observe(node);
        schedule();
      };
      refs.current.set(key, ref);
    }
    return ref;
  };

  const onScroll = useCallback(() => flushSync(update), [update]);

  const rootRef = useCallback(
    (node: HTMLElement | null) => {
      if (root.current !== null) {
        root.current.removeEventListener('scroll', onScroll);
        observer()?.unobserve(root.current);
      }
      root.current = node;
      if (node === null) return;
      node.addEventListener('scroll', onScroll, { passive: true });
      observer()?.observe(node);
      schedule();
    },
    [onScroll, schedule],
  );

  if (swept.current.keys !== keys) {
    swept.current.keys = keys;
    const known = new Set(keys);
    for (const key of [...measured.current.keys()])
      if (!known.has(key)) measured.current.delete(key);
    for (const key of [...refs.current.keys()]) if (!known.has(key)) refs.current.delete(key);
  }
  if (members.size > 0 && swept.current.members !== members) {
    swept.current.members = members;
    const ids = new Set<string>();
    for (const list of members.values()) for (const id of list) ids.add(id);
    for (const id of [...shares.current.keys()]) if (!ids.has(id)) shares.current.delete(id);
  }

  if (chunked.current.keys !== keys) {
    const next = timelineChunks(keys, chunked.current.assigned, CHUNK_SIZE);
    chunked.current = { keys, assigned: next.assigned, chunks: next.chunks };
  }
  const slots = (shown: TimelineView): TimelineSlot[] => {
    const order = latestKeys.current;
    const sizes = knownSizes();
    const near = windowKeys(order, sizes, shown.top, shown.bottom);
    return timelineSlots(
      order,
      sizes,
      (key) =>
        (!shown.seen.has(key) && !sizes.has(key)) || near.has(key) || latestPinned.current.has(key),
    );
  };
  return {
    chunks: chunked.current.chunks,
    subscribe,
    view,
    slots,
    blockRef,
    rootRef,
  };
}

export function useTimelineSlots(timeline: TimelineWindow): TimelineSlot[] {
  const shown = useSyncExternalStore(timeline.subscribe, timeline.view, timeline.view);
  return timeline.slots(shown);
}
