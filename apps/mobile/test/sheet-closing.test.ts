import { afterEach, expect, it, vi } from 'vitest';

import { afterSheetsClose, sheetClosing } from '../src/ui/primitives/sheet-closing';

afterEach(() => {
  vi.useRealTimers();
});

it('runs at once when no sheet is closing', () => {
  const run = vi.fn();
  afterSheetsClose(run);
  expect(run).toHaveBeenCalledOnce();
});

it('waits until every closing sheet has unmounted, and runs once', () => {
  const first = sheetClosing();
  const second = sheetClosing();
  const run = vi.fn();
  afterSheetsClose(run);
  first();
  first();
  expect(run).not.toHaveBeenCalled();
  second();
  expect(run).toHaveBeenCalledOnce();
  sheetClosing()();
  expect(run).toHaveBeenCalledOnce();
});

it('forgets a cancelled wait', () => {
  const release = sheetClosing();
  const run = vi.fn();
  const cancel = afterSheetsClose(run);
  cancel();
  release();
  expect(run).not.toHaveBeenCalled();
});

it('stops waiting for a sheet that never reports its unmount', () => {
  vi.useFakeTimers();
  sheetClosing();
  const run = vi.fn();
  afterSheetsClose(run);
  vi.advanceTimersByTime(2999);
  expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(run).toHaveBeenCalledOnce();
});
