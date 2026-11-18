import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CHANNEL_BODY_PANEL, CHANNEL_DOCK_STORAGE_KEY } from '../src/client/channel-dock-layout.js';
import {
  LAYOUT_MODE_STORAGE_KEY,
  MAX_SIDE_COLUMN_WIDTH,
  readLayoutMode,
  writeLayoutMode,
} from '../src/client/layout-mode.js';
import { HOME_SLOT, WORKSPACE_CHANNELS } from '../src/client/workspace-context.js';

function memory(entries: ReadonlyMap<string, string>) {
  const values = new Map(entries);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const panel = fc.constantFrom(
  CHANNEL_BODY_PANEL,
  WORKSPACE_CHANNELS,
  HOME_SLOT,
  'activity-center',
  'market',
  'instance:abc',
  '',
);
const record = fc.record(
  {
    mode: fc.oneof(fc.constantFrom('simple', 'advanced'), fc.anything()),
    view: fc.oneof(panel, fc.anything()),
    sideColumn: fc.oneof(panel, fc.constant(null), fc.anything()),
    channelsWidth: fc.oneof(fc.double({ min: 0, max: 1 }), fc.double(), fc.anything()),
    column: fc.anything(),
  },
  { requiredKeys: [] },
);
const stored = fc.oneof(
  record.map((value) => JSON.stringify(value)),
  fc.string(),
  fc.constant(undefined),
);
const storage = fc.tuple(stored, fc.option(fc.string(), { nil: undefined })).map(([mode, dock]) => {
  const entries = new Map<string, string>();
  if (mode !== undefined) entries.set(LAYOUT_MODE_STORAGE_KEY, mode);
  if (dock !== undefined) entries.set(CHANNEL_DOCK_STORAGE_KEY, dock);
  return entries;
});

function savedMode(entries: ReadonlyMap<string, string>): unknown {
  try {
    const parsed: unknown = JSON.parse(entries.get(LAYOUT_MODE_STORAGE_KEY) ?? 'null');
    return typeof parsed === 'object' && parsed !== null && 'mode' in parsed
      ? parsed.mode
      : undefined;
  } catch {
    return undefined;
  }
}

describe('Layout mode is a device-local choice (docs/decisions/onboarding.md)', () => {
  it('keeps a saved choice, else starts Humans with a saved layout in Advanced and new Humans in Simple', () => {
    fc.assert(
      fc.property(storage, (entries) => {
        const { mode } = readLayoutMode(memory(entries));
        const saved = savedMode(entries);
        if (saved === 'simple' || saved === 'advanced') expect(mode).toBe(saved);
        else expect(mode).toBe(entries.get(CHANNEL_DOCK_STORAGE_KEY) ? 'advanced' : 'simple');
      }),
      { numRuns: 2000 },
    );
  });

  it('never rewrites the Advanced arrangement when reading or saving the Simple record', () => {
    fc.assert(
      fc.property(storage, (entries) => {
        const device = memory(entries);
        const before = device.values.get(CHANNEL_DOCK_STORAGE_KEY);
        writeLayoutMode(readLayoutMode(device), device);
        expect(device.values.get(CHANNEL_DOCK_STORAGE_KEY)).toBe(before);
      }),
    );
  });

  it('migrates a saved Messages or Home view to the Channel list, never into the Side column', () => {
    fc.assert(
      fc.property(panel, fc.constantFrom('simple', 'advanced'), (view, mode) => {
        const entries = new Map([[LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode, view })]]);
        const { sideColumn } = readLayoutMode(memory(entries));
        expect(sideColumn).not.toBe(CHANNEL_BODY_PANEL);
        expect(sideColumn).not.toBe(HOME_SLOT);
        if (view !== '' && view !== CHANNEL_BODY_PANEL && view !== HOME_SLOT)
          expect(sideColumn).toBe(view);
      }),
    );
  });

  it('reads back exactly what it saved, with a Side column at most 60% wide', () => {
    fc.assert(
      fc.property(storage, (entries) => {
        const device = memory(entries);
        const layout = readLayoutMode(device);
        expect(layout.channelsWidth).toBeGreaterThan(0);
        expect(layout.channelsWidth).toBeLessThanOrEqual(MAX_SIDE_COLUMN_WIDTH);
        expect(writeLayoutMode(layout, device)).toBe(true);
        expect(readLayoutMode(device)).toEqual(layout);
      }),
    );
  });
});
