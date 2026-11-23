import { useRef, type RefCallback } from 'react';
import type { ChannelWorkspaceState, DockDirection } from './channel-dock-layout.js';
import {
  moveChannelSplit,
  resizeChannelSplit,
  splitPanels,
  type ChannelSplit,
} from './channel-split-layout.js';
import {
  ClientSettingsError,
  clientSettings,
  settingsRevision,
  type ClientSettingsDomain,
} from './client-settings-control.js';
import { useMountedResource } from './mounted-resource.js';
import { MAX_SIDE_COLUMN_WIDTH, type LayoutMode, type SimpleLayout } from './layout-mode.js';

const DIRECTIONS: readonly DockDirection[] = ['left', 'right', 'above', 'below'];
const MODES: readonly LayoutMode[] = ['simple', 'advanced'];
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const MIN_COLUMN_WIDTH = 0.2;
const MAX_COLUMN_WIDTH = 0.6;
const MAX_GAP = 16;
const MIN_MEMBERS_RATIO = 0.2;
const MAX_MEMBERS_RATIO = 0.6;
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 4000;
const MAX_SPLIT_DEPTH = 32;

export interface LayoutMembers {
  readonly open: boolean;
  readonly ratio: number;
}

export interface LayoutRail {
  readonly order: readonly string[];
  readonly hidden: readonly string[];
}

export interface LayoutSnapshot {
  readonly global: SimpleLayout;
  readonly rail: LayoutRail;
  readonly channels: Readonly<Record<string, ChannelWorkspaceState>>;
  readonly seed: ChannelWorkspaceState;
  readonly activeChannelId: string | undefined;
  readonly knownChannelIds: readonly string[];
  readonly gap: number;
  readonly members: LayoutMembers;
  readonly splits: Readonly<Record<string, ChannelSplit>>;
  readonly splitOf: (channelId: string, saved: ChannelSplit | undefined) => ChannelSplit;
}

export interface LayoutChannelChange {
  readonly id: string;
  readonly state?: ChannelWorkspaceState | undefined;
  readonly split?: ChannelSplit | null | undefined;
}

export interface LayoutSettingsChange {
  readonly global?: SimpleLayout | undefined;
  readonly rail?: LayoutRail | undefined;
  readonly channel?: LayoutChannelChange | undefined;
  readonly gap?: number | undefined;
  readonly members?: LayoutMembers | undefined;
}

export interface LayoutSettingsHost {
  snapshot(): LayoutSnapshot;
  apply(change: LayoutSettingsChange): void;
}

const invalid = (message: string): ClientSettingsError =>
  new ClientSettingsError('client-settings-invalid-input', message);

function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid(`${path} must be an object.`);
  const entry = value as Record<string, unknown>;
  const extra = Object.keys(entry).find((key) => !keys.includes(key));
  if (extra !== undefined) throw invalid(`${path}.${extra} is not a layout setting.`);
  return entry;
}

function between(value: unknown, path: string, min: number, max: number, open = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (open ? value <= min : value < min) ||
    value > max
  )
    throw invalid(`${path} must be a number ${open ? 'above' : 'from'} ${min} to ${max}.`);
  return value;
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw invalid(`${path} must be true or false.`);
  return value;
}

function idList(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item === ''))
    throw invalid(`${path} must be a list of ids.`);
  return [...new Set(value as string[])];
}

function oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (!options.includes(value as T)) throw invalid(`${path} must be one of ${options.join(', ')}.`);
  return value as T;
}

function effectiveSplit(snapshot: LayoutSnapshot, id: string): ChannelSplit {
  return snapshot.splitOf(id, Object.hasOwn(snapshot.splits, id) ? snapshot.splits[id] : undefined);
}

function channelState(snapshot: LayoutSnapshot, id: string, state: ChannelWorkspaceState) {
  return {
    open: state.open,
    direction: state.direction,
    ratio: state.ratio,
    split: effectiveSplit(snapshot, id),
    splitSaved: Object.hasOwn(snapshot.splits, id),
  };
}

export function readLayoutSettings(snapshot: LayoutSnapshot) {
  const { global, rail, channels, seed, activeChannelId, splits } = snapshot;
  const listed = [
    ...new Set([
      ...Object.keys(channels),
      ...Object.keys(splits),
      ...(activeChannelId === undefined ? [] : [activeChannelId]),
    ]),
  ];
  const view = {
    activeChannelId: activeChannelId ?? null,
    gap: snapshot.gap,
    members: { open: snapshot.members.open, ratio: snapshot.members.ratio },
    global: {
      mode: global.mode,
      sideColumn: global.sideColumn,
      channelsWidth: global.channelsWidth,
      column: {
        open: global.column.open,
        width: global.column.width,
        hidden: [...global.column.hidden],
        order: [...global.column.order],
        heights: { ...global.column.heights },
      },
    },
    rail: { order: [...rail.order], hidden: [...rail.hidden] },
    channels: Object.fromEntries(
      listed.map((id) => [
        id,
        channelState(snapshot, id, Object.hasOwn(channels, id) ? channels[id]! : seed),
      ]),
    ),
  };
  return { revision: settingsRevision(view), ...view };
}

export type LayoutSettingsView = ReturnType<typeof readLayoutSettings>;

function planGlobal(current: SimpleLayout, raw: unknown): SimpleLayout {
  const patch = record(raw, 'global', ['mode', 'sideColumn', 'channelsWidth', 'column']);
  let next = current;
  if (patch.mode !== undefined) next = { ...next, mode: oneOf(patch.mode, 'global.mode', MODES) };
  if (patch.sideColumn !== undefined) {
    if (patch.sideColumn !== null && (typeof patch.sideColumn !== 'string' || !patch.sideColumn))
      throw invalid('global.sideColumn must be a panel id or null.');
    next = { ...next, sideColumn: patch.sideColumn };
  }
  if (patch.channelsWidth !== undefined)
    next = {
      ...next,
      channelsWidth: between(
        patch.channelsWidth,
        'global.channelsWidth',
        0,
        MAX_SIDE_COLUMN_WIDTH,
        true,
      ),
    };
  if (patch.column !== undefined) {
    const column = record(patch.column, 'global.column', [
      'open',
      'width',
      'hidden',
      'order',
      'heights',
    ]);
    next = {
      ...next,
      column: {
        ...next.column,
        ...(column.open === undefined ? {} : { open: flag(column.open, 'global.column.open') }),
        ...(column.width === undefined
          ? {}
          : {
              width: between(
                column.width,
                'global.column.width',
                MIN_COLUMN_WIDTH,
                MAX_COLUMN_WIDTH,
              ),
            }),
        ...(column.hidden === undefined
          ? {}
          : { hidden: idList(column.hidden, 'global.column.hidden') }),
        ...(column.order === undefined
          ? {}
          : { order: idList(column.order, 'global.column.order') }),
        ...(column.heights === undefined
          ? {}
          : { heights: heights(next.column.heights, column.heights) }),
      },
    };
  }
  return next;
}

function heights(
  current: Readonly<Record<string, number>>,
  raw: unknown,
): Readonly<Record<string, number>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw invalid('global.column.heights must map panel ids to pixel heights or null.');
  const next: Record<string, number> = { ...current };
  for (const [id, value] of Object.entries(raw)) {
    if (id === '') throw invalid('global.column.heights needs panel ids.');
    if (value === null) delete next[id];
    else
      next[id] = Math.round(
        between(value, `global.column.heights.${id}`, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT),
      );
  }
  return next;
}

function planMembers(current: LayoutMembers, raw: unknown): LayoutMembers {
  const patch = record(raw, 'members', ['open', 'ratio']);
  if (Object.keys(patch).length === 0) throw invalid('members needs open or ratio.');
  return {
    open: patch.open === undefined ? current.open : flag(patch.open, 'members.open'),
    ratio:
      patch.ratio === undefined
        ? current.ratio
        : between(patch.ratio, 'members.ratio', MIN_MEMBERS_RATIO, MAX_MEMBERS_RATIO),
  };
}

function planGap(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > MAX_GAP)
    throw invalid(`gap must be a whole number of pixels from 0 to ${MAX_GAP}.`);
  return raw;
}

function splitTree(raw: unknown, path: string, depth: number): ChannelSplit {
  if (depth > MAX_SPLIT_DEPTH) throw invalid('channel.split is nested too deeply.');
  if (typeof raw === 'object' && raw !== null && 'panel' in raw) {
    const leaf = record(raw, path, ['panel']);
    if (typeof leaf.panel !== 'string' || !/^[a-zA-Z0-9:@._-]{1,160}$/.test(leaf.panel))
      throw invalid(`${path}.panel must be a panel id.`);
    return { panel: leaf.panel };
  }
  const node = record(raw, path, ['axis', 'ratio', 'first', 'second']);
  return {
    axis: oneOf(node.axis, `${path}.axis`, ['horizontal', 'vertical'] as const),
    ratio: between(node.ratio, `${path}.ratio`, MIN_RATIO, MAX_RATIO),
    first: splitTree(node.first, `${path}.first`, depth + 1),
    second: splitTree(node.second, `${path}.second`, depth + 1),
  };
}

function samePanels(next: ChannelSplit, current: ChannelSplit): boolean {
  const panels = splitPanels(next);
  const expected = splitPanels(current);
  return (
    panels.length === new Set(panels).size &&
    panels.length === expected.length &&
    expected.every((id) => panels.includes(id))
  );
}

function splitNode(tree: ChannelSplit, path: string): ChannelSplit | undefined {
  let node: ChannelSplit = tree;
  for (const step of path) {
    if ('panel' in node) return undefined;
    node = step === '0' ? node.first : node.second;
  }
  return node;
}

function planSplit(
  current: ChannelSplit,
  patch: Record<string, unknown>,
): ChannelSplit | null | undefined {
  const edits = ['split', 'move', 'resize'].filter((key) => patch[key] !== undefined);
  if (edits.length > 1) throw invalid('channel takes one of split, move or resize at a time.');
  if (patch.split === null) return null;
  if (patch.split !== undefined) {
    const next = splitTree(patch.split, 'channel.split', 0);
    if (!samePanels(next, current))
      throw invalid(
        `channel.split must hold each of these panels once: ${splitPanels(current).join(', ')}.`,
      );
    return next;
  }
  if (patch.move !== undefined) {
    const move = record(patch.move, 'channel.move', ['panel', 'target', 'direction']);
    const panels = splitPanels(current);
    if (typeof move.panel !== 'string' || typeof move.target !== 'string')
      throw invalid('channel.move needs panel and target ids from channel.split.');
    const direction = oneOf(move.direction, 'channel.move.direction', DIRECTIONS);
    const next = moveChannelSplit(current, move.panel, move.target, direction);
    if (next === current)
      throw invalid(
        `channel.move needs two different panels from ${panels.join(', ')}; messages stays in place.`,
      );
    return next;
  }
  if (patch.resize !== undefined) {
    const resize = record(patch.resize, 'channel.resize', ['path', 'ratio']);
    if (typeof resize.path !== 'string' || !/^[01]*$/.test(resize.path))
      throw invalid('channel.resize.path must be a string of 0 (first) and 1 (second) steps.');
    const node = splitNode(current, resize.path);
    if (!node || 'panel' in node)
      throw invalid('channel.resize.path must lead to a split, not a panel.');
    return resizeChannelSplit(
      current,
      resize.path,
      between(resize.ratio, 'channel.resize.ratio', MIN_RATIO, MAX_RATIO),
    );
  }
  return undefined;
}

function planRail(current: LayoutRail, raw: unknown): LayoutRail {
  const patch = record(raw, 'rail', ['order', 'hidden']);
  return {
    order: patch.order === undefined ? current.order : idList(patch.order, 'rail.order'),
    hidden: patch.hidden === undefined ? current.hidden : idList(patch.hidden, 'rail.hidden'),
  };
}

function planChannel(snapshot: LayoutSnapshot, raw: unknown) {
  const patch = record(raw, 'channel', [
    'id',
    'open',
    'direction',
    'ratio',
    'split',
    'move',
    'resize',
  ]);
  if (typeof patch.id !== 'string' || patch.id === '') throw invalid('channel.id is required.');
  const id = patch.id;
  if (Object.keys(patch).length === 1) throw invalid('channel needs a field to change.');
  const known =
    Object.hasOwn(snapshot.channels, id) ||
    id === snapshot.activeChannelId ||
    snapshot.knownChannelIds.includes(id);
  if (!known) throw new ClientSettingsError('layout-channel-unknown', `No Channel ${id}.`);
  const split = planSplit(effectiveSplit(snapshot, id), patch);
  if (
    (patch.direction !== undefined || patch.ratio !== undefined) &&
    split !== null &&
    (split !== undefined || Object.hasOwn(snapshot.splits, id))
  )
    throw invalid(
      'channel.direction and channel.ratio only place a Channel without a saved split; use channel.move or channel.resize, or send "split": null to go back to them.',
    );
  const base = Object.hasOwn(snapshot.channels, id) ? snapshot.channels[id]! : snapshot.seed;
  const placed = ['open', 'direction', 'ratio'].some((key) => patch[key] !== undefined);
  return {
    id,
    ...(split === undefined ? {} : { split }),
    ...(placed ? { state: planState(base, patch) } : {}),
  };
}

function planState(base: ChannelWorkspaceState, patch: Record<string, unknown>) {
  return {
    ...base,
    ...(patch.open === undefined ? {} : { open: flag(patch.open, 'channel.open') }),
    ...(patch.direction === undefined
      ? {}
      : { direction: oneOf(patch.direction, 'channel.direction', DIRECTIONS) }),
    ...(patch.ratio === undefined
      ? {}
      : { ratio: between(patch.ratio, 'channel.ratio', MIN_RATIO, MAX_RATIO) }),
  };
}

export function planLayoutSettings(
  snapshot: LayoutSnapshot,
  raw: unknown,
  expectedRevision: string,
): LayoutSettingsChange {
  const patch = record(raw, 'patch', ['global', 'rail', 'channel', 'gap', 'members']);
  if (Object.keys(patch).length === 0) throw invalid('The patch changes nothing.');
  const change: LayoutSettingsChange = {
    ...(patch.global === undefined ? {} : { global: planGlobal(snapshot.global, patch.global) }),
    ...(patch.rail === undefined ? {} : { rail: planRail(snapshot.rail, patch.rail) }),
    ...(patch.channel === undefined ? {} : { channel: planChannel(snapshot, patch.channel) }),
    ...(patch.gap === undefined ? {} : { gap: planGap(patch.gap) }),
    ...(patch.members === undefined
      ? {}
      : { members: planMembers(snapshot.members, patch.members) }),
  };
  if (readLayoutSettings(snapshot).revision !== expectedRevision)
    throw new ClientSettingsError('client-settings-revision-conflict');
  return change;
}

export function applyLayoutSettings(
  snapshot: LayoutSnapshot,
  change: LayoutSettingsChange,
): LayoutSnapshot {
  const edit = change.channel;
  const splits = { ...snapshot.splits };
  if (edit?.split === null) delete splits[edit.id];
  else if (edit?.split) splits[edit.id] = edit.split;
  return {
    ...snapshot,
    ...(change.global ? { global: change.global } : {}),
    ...(change.rail ? { rail: change.rail } : {}),
    ...(change.gap === undefined ? {} : { gap: change.gap }),
    ...(change.members ? { members: change.members } : {}),
    ...(edit?.state ? { channels: { ...snapshot.channels, [edit.id]: edit.state } } : {}),
    splits,
  };
}

export function layoutSettingsDomain(host: LayoutSettingsHost): ClientSettingsDomain {
  return {
    read: () => readLayoutSettings(host.snapshot()),
    write: (patch, { expectedRevision, assertLive }) => {
      const change = planLayoutSettings(host.snapshot(), patch, expectedRevision);
      assertLive();
      host.apply(change);
      return readLayoutSettings(host.snapshot());
    },
  };
}

export function useLayoutSettingsControl(
  enabled: boolean,
  host: LayoutSettingsHost,
): RefCallback<HTMLSpanElement> {
  const current = useRef(host);
  current.current = host;
  return useMountedResource<HTMLSpanElement>(
    () =>
      enabled
        ? clientSettings.register(
            'layout',
            layoutSettingsDomain({
              snapshot: () => current.current.snapshot(),
              apply: (change) => current.current.apply(change),
            }),
          )
        : undefined,
    [enabled],
  );
}
