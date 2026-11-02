import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createActiveDay, localDay, startActiveDayWatch } from '../src/telemetry/active-day.js';
import { INSTALL_ID_FILE, readActiveDay } from '../src/telemetry/service.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup(at: { value: Date }, enabled = true) {
  const dataDir = mkdtempSync(join(tmpdir(), 'bh-active-day-'));
  dirs.push(dataDir);
  writeFileSync(
    join(dataDir, INSTALL_ID_FILE),
    JSON.stringify({ installId: '00000000-0000-4000-8000-000000000009' }),
  );
  const capture = vi.fn();
  const activeDay = createActiveDay({
    telemetry: { enabled, capture },
    dataDir,
    now: () => at.value,
  });
  return { dataDir, capture, activeDay };
}

describe('app:active_day_start', () => {
  it('is sent once per local calendar day, across restarts', () => {
    const at = { value: new Date(2026, 9, 28, 9, 0) };
    const { dataDir, capture, activeDay } = setup(at);
    activeDay.mark('bot_mode_enter', 'desktop_app');
    activeDay.mark('message');
    expect(capture.mock.calls).toEqual([
      ['app:active_day_start', { trigger: 'bot_mode_enter', surface: 'desktop_app' }],
    ]);
    expect(readActiveDay(dataDir)).toBe(localDay(at.value));

    const restarted = createActiveDay({
      telemetry: { enabled: true, capture },
      dataDir,
      now: () => at.value,
    });
    restarted.mark('message');
    expect(capture).toHaveBeenCalledOnce();

    at.value = new Date(2026, 9, 29, 0, 5);
    restarted.mark('message');
    expect(capture.mock.calls.at(-1)).toEqual(['app:active_day_start', { trigger: 'message' }]);
  });

  it('stays silent while telemetry is off', () => {
    const { capture, activeDay } = setup({ value: new Date() }, false);
    activeDay.mark('bot_mode_enter');
    expect(capture).not.toHaveBeenCalled();
  });

  it('counts IM-only use from today and prefers Web or phone messages', () => {
    const at = { value: new Date(2026, 9, 28, 15, 0) };
    const mark = vi.fn();
    const counts = vi
      .fn()
      .mockReturnValueOnce({ human: 0, im: 0 })
      .mockReturnValueOnce({ human: 0, im: 2 })
      .mockReturnValueOnce({ human: 1, im: 2 });
    const stop = startActiveDayWatch({
      activeDay: { mark },
      counts,
      now: () => at.value,
      intervalMs: 10,
    });
    expect(counts).toHaveBeenCalledWith(new Date(2026, 9, 28));
    expect(mark).not.toHaveBeenCalled();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        stop();
        expect(mark.mock.calls.slice(0, 2)).toEqual([['im_message', 'im'], ['message']]);
        resolve();
      }, 35);
    });
  });
});
