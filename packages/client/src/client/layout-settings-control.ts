import { useRef, type RefCallback } from 'react';
import type { ChannelWorkspaceState, DockDirection } from './channel-dock-layout.js';
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
}

export interface LayoutSettingsChange {
  readonly global?: SimpleLayout | undefined;
  readonly rail?: LayoutRail | undefined;
  readonly channel?: { readonly id: string; readonly state: ChannelWorkspaceState } | undefined;
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

function channelState(state: ChannelWorkspaceState) {
  return { open: state.open, direction: state.direction, ratio: state.ratio };
}

export function readLayoutSettings(snapshot: LayoutSnapshot) {
  const { global, rail, channels, seed, activeChannelId } = snapshot;
  const view = {
    activeChannelId: activeChannelId ?? null,
    global: {
      mode: global.mode,
      sideColumn: global.sideColumn,
      channelsWidth: global.channelsWidth,
      column: {
        open: global.column.open,
        width: global.column.width,
        hidden: [...global.column.hidden],
        order: [...global.column.order],
      },
    },
    rail: { order: [...rail.order], hidden: [...rail.hidden] },
    channels: Object.fromEntries([
      ...Object.entries(channels).map(([id, state]) => [id, channelState(state)] as const),
      ...(activeChannelId === undefined || Object.hasOwn(channels, activeChannelId)
        ? []
        : [[activeChannelId, channelState(seed)] as const]),
    ]),
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
    const column = record(patch.column, 'global.column', ['open', 'width', 'hidden', 'order']);
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
      },
    };
  }
  return next;
}

function planRail(current: LayoutRail, raw: unknown): LayoutRail {
  const patch = record(raw, 'rail', ['order', 'hidden']);
  return {
    order: patch.order === undefined ? current.order : idList(patch.order, 'rail.order'),
    hidden: patch.hidden === undefined ? current.hidden : idList(patch.hidden, 'rail.hidden'),
  };
}

function planChannel(snapshot: LayoutSnapshot, raw: unknown) {
  const patch = record(raw, 'channel', ['id', 'open', 'direction', 'ratio']);
  if (typeof patch.id !== 'string' || patch.id === '') throw invalid('channel.id is required.');
  const id = patch.id;
  if (Object.keys(patch).length === 1) throw invalid('channel needs a field to change.');
  const known =
    Object.hasOwn(snapshot.channels, id) ||
    id === snapshot.activeChannelId ||
    snapshot.knownChannelIds.includes(id);
  if (!known) throw new ClientSettingsError('layout-channel-unknown', `No Channel ${id}.`);
  const base = Object.hasOwn(snapshot.channels, id) ? snapshot.channels[id]! : snapshot.seed;
  return {
    id,
    state: {
      ...base,
      ...(patch.open === undefined ? {} : { open: flag(patch.open, 'channel.open') }),
      ...(patch.direction === undefined
        ? {}
        : { direction: oneOf(patch.direction, 'channel.direction', DIRECTIONS) }),
      ...(patch.ratio === undefined
        ? {}
        : { ratio: between(patch.ratio, 'channel.ratio', MIN_RATIO, MAX_RATIO) }),
    },
  };
}

export function planLayoutSettings(
  snapshot: LayoutSnapshot,
  raw: unknown,
  expectedRevision: string,
): LayoutSettingsChange {
  const patch = record(raw, 'patch', ['global', 'rail', 'channel']);
  if (Object.keys(patch).length === 0) throw invalid('The patch changes nothing.');
  const change: LayoutSettingsChange = {
    ...(patch.global === undefined ? {} : { global: planGlobal(snapshot.global, patch.global) }),
    ...(patch.rail === undefined ? {} : { rail: planRail(snapshot.rail, patch.rail) }),
    ...(patch.channel === undefined ? {} : { channel: planChannel(snapshot, patch.channel) }),
  };
  if (readLayoutSettings(snapshot).revision !== expectedRevision)
    throw new ClientSettingsError('client-settings-revision-conflict');
  return change;
}

export function applyLayoutSettings(
  snapshot: LayoutSnapshot,
  change: LayoutSettingsChange,
): LayoutSnapshot {
  return {
    ...snapshot,
    ...(change.global ? { global: change.global } : {}),
    ...(change.rail ? { rail: change.rail } : {}),
    ...(change.channel
      ? { channels: { ...snapshot.channels, [change.channel.id]: change.channel.state } }
      : {}),
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
