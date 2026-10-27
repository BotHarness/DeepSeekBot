import { afterEach, describe, expect, it, vi } from 'vitest';

const dialogs = vi.hoisted(() => ({
  confirmDestructive: vi.fn(),
  showAppDialog: vi.fn(),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  ...dialogs,
  showActionMenu: vi.fn(),
}));

import type { BotScheduleSummary, ScheduleTrigger } from '../src/host/wire';
import {
  routineGroupOf,
  routineGroups,
  routineSwipeActions,
  type RoutineChanges,
} from '../src/ui/chat/profile-routines';
import { t } from '../src/ui/strings';

const zone = 'Asia/Tokyo';
const routine = (
  id: string,
  trigger: ScheduleTrigger,
  extra: Partial<BotScheduleSummary> = {},
): BotScheduleSummary => ({
  id,
  title: `Routine ${id}`,
  trigger,
  enabled: true,
  ...extra,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.clearAllMocks());

describe('Routines tab grouping', () => {
  it('maps each trigger to Daily, Weekly, One-off or Other', () => {
    expect(routineGroupOf({ kind: 'daily', time: '09:00', timeZone: zone })).toBe('daily');
    expect(
      routineGroupOf({
        kind: 'weekly',
        time: '09:00',
        timeZone: zone,
        weekdays: [1],
      }),
    ).toBe('weekly');
    expect(
      routineGroupOf({
        kind: 'once',
        date: '2026-11-01',
        time: '09:00',
        timeZone: zone,
      }),
    ).toBe('once');
    expect(routineGroupOf({ kind: 'every', everySeconds: 3600 })).toBe('other');
    expect(routineGroupOf({ kind: 'cron', expression: '0 9 * * *', timeZone: zone })).toBe('other');
  });

  it('orders groups by frequency, drops empty ones and sorts by next run with paused last', () => {
    const daily = { kind: 'daily', time: '09:00', timeZone: zone } as const;
    const groups = routineGroups([
      routine('hourly', { kind: 'every', everySeconds: 3600 }),
      routine('late', daily, { nextRunAt: '2026-10-28T09:00:00.000Z' }),
      routine('paused', daily, {
        enabled: false,
        nextRunAt: '2026-10-27T08:00:00.000Z',
      }),
      routine('soon', daily, { nextRunAt: '2026-10-27T09:00:00.000Z' }),
      routine('trip', {
        kind: 'once',
        date: '2026-11-01',
        time: '07:00',
        timeZone: zone,
      }),
    ]);
    expect(groups.map((group) => [group.group, group.routines.map((entry) => entry.id)])).toEqual([
      ['daily', ['soon', 'late', 'paused']],
      ['once', ['trip']],
      ['other', ['hourly']],
    ]);
  });
});

describe('Routines tab swipe actions', () => {
  const changes = () =>
    ({
      runNow: vi.fn(async () => ({}) as never),
      setEnabled: vi.fn(async () => ({}) as never),
      remove: vi.fn(async () => undefined),
    }) satisfies RoutineChanges;
  const daily = routine('a', { kind: 'daily', time: '09:00', timeZone: zone });

  it('offers Run now, Pause and Delete, and refreshes after a run', async () => {
    const port = changes();
    const onChanged = vi.fn();
    const actions = routineSwipeActions(daily, port, onChanged);
    expect(actions.map((action) => [action.key, action.label, action.tone])).toEqual([
      ['run', t.routineRunNow, 'accent'],
      ['pause', t.routinePause, 'warning'],
      ['delete', t.routineDelete, 'danger'],
    ]);
    actions[0]!.run();
    await settle();
    expect(port.runNow).toHaveBeenCalledWith('a');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('pauses an active routine and resumes a paused one', async () => {
    const port = changes();
    const onChanged = vi.fn();
    routineSwipeActions(daily, port, onChanged)[1]!.run();
    const resume = routineSwipeActions({ ...daily, enabled: false }, port, onChanged)[1]!;
    expect([resume.key, resume.label]).toEqual(['resume', t.routineResume]);
    resume.run();
    await settle();
    expect(port.setEnabled.mock.calls).toEqual([
      ['a', false],
      ['a', true],
    ]);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('deletes only after the Human confirms the consequence', async () => {
    const port = changes();
    const onChanged = vi.fn();
    routineSwipeActions(daily, port, onChanged)[2]!.run();
    expect(port.remove).not.toHaveBeenCalled();
    expect(dialogs.confirmDestructive).toHaveBeenCalledWith(
      t.routineDeleteConfirm('Routine a'),
      t.routineDeleteHint,
      t.routineDelete,
      expect.any(Function),
    );
    (dialogs.confirmDestructive.mock.calls[0]![3] as () => void)();
    await settle();
    expect(port.remove).toHaveBeenCalledWith('a');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('shows a refusal and reloads the list', async () => {
    const port = changes();
    port.runNow.mockRejectedValueOnce(new Error('The Host is offline.'));
    const onChanged = vi.fn();
    routineSwipeActions(daily, port, onChanged)[0]!.run();
    await settle();
    expect(dialogs.showAppDialog).toHaveBeenCalledWith(t.routineFailed, 'The Host is offline.', [
      { text: t.done },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
