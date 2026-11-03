import { useCallback, useRef, useState } from 'react';
import { reportInvariant } from './diagnostic-log.js';
import { flushSync } from 'react-dom';

const KEEP_RENDERED_VIEWPORTS = 1.5;

export type TimelineRun =
  | { kind: 'group'; index: number }
  | { kind: 'gap'; from: number; to: number; height: number };

export function timelineRuns(
  keys: readonly string[],
  heights: ReadonlyMap<string, number>,
  rendered: (key: string) => boolean,
): TimelineRun[] {
  const runs: TimelineRun[] = [];
  keys.forEach((key, index) => {
    const height = heights.get(key);
    if (height === undefined || rendered(key)) {
      runs.push({ kind: 'group', index });
      return;
    }
    const last = runs.at(-1);
    if (last?.kind === 'gap' && last.to === index - 1) {
      last.to = index;
      last.height += height;
    } else {
      runs.push({ kind: 'gap', from: index, to: index, height });
    }
  });
  return runs;
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

export interface TimelineWindow {
  runs: TimelineRun[];
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
  const [view, setView] = useState<{ seen: ReadonlySet<string>; top: number; bottom: number }>(
    () => ({ seen: new Set(), top: -Infinity, bottom: Infinity }),
  );

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
    setView((current) =>
      sameKeys(windowKeys(order, sizes, current.top, current.bottom), next) &&
      sameKeys(current.seen, new Set(order))
        ? current
        : { seen: new Set(order), top, bottom },
    );
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

  const known = new Set(keys);
  for (const key of [...measured.current.keys()]) if (!known.has(key)) measured.current.delete(key);
  for (const key of [...refs.current.keys()]) if (!known.has(key)) refs.current.delete(key);
  if (members.size > 0) {
    const ids = new Set<string>();
    for (const list of members.values()) for (const id of list) ids.add(id);
    for (const id of [...shares.current.keys()]) if (!ids.has(id)) shares.current.delete(id);
  }

  const sizes = knownSizes();
  const near = windowKeys(keys, sizes, view.top, view.bottom);
  return {
    runs: timelineRuns(
      keys,
      sizes,
      (key) => (!view.seen.has(key) && !sizes.has(key)) || near.has(key) || pinned.has(key),
    ),
    blockRef,
    rootRef,
  };
}
