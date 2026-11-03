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

export function useTimelineWindow(
  keys: readonly string[],
  pinned: ReadonlySet<string>,
): TimelineWindow {
  const heights = useRef(new Map<string, number>());
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
    let origin: number | undefined;
    let y = 0;
    for (const key of order) {
      const node = nodes.current.get(key);
      if (node !== undefined) {
        origin = node.offsetTop - y;
        break;
      }
      y += heights.current.get(key) ?? 0;
    }
    if (origin === undefined) return;
    const keep = element.clientHeight * KEEP_RENDERED_VIEWPORTS;
    const top = element.scrollTop - origin - keep;
    const bottom = element.scrollTop - origin + element.clientHeight + keep;
    const next = nearKeys(order, heights.current, top, bottom);
    if (
      !reported.current &&
      order.length > 0 &&
      order.every((key) => range.current.keys.has(key)) &&
      nearKeys(order, heights.current, range.current.top, range.current.bottom).size === 0
    ) {
      reported.current = true;
      reportInvariant('timeline-window-lost-groups', 'timeline window lost its rendered groups', {
        groups: order.length,
        measured: order.filter((key) => heights.current.has(key)).length,
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
      sameKeys(windowKeys(order, heights.current, current.top, current.bottom), next) &&
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
          if (height > 0 && heights.current.get(key) !== height) {
            heights.current.set(key, height);
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
        if (height > 0) heights.current.set(key, height);
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
  for (const key of [...heights.current.keys()]) if (!known.has(key)) heights.current.delete(key);
  for (const key of [...refs.current.keys()]) if (!known.has(key)) refs.current.delete(key);

  const near = windowKeys(keys, heights.current, view.top, view.bottom);
  return {
    runs: timelineRuns(
      keys,
      heights.current,
      (key) => !view.seen.has(key) || near.has(key) || pinned.has(key),
    ),
    blockRef,
    rootRef,
  };
}
