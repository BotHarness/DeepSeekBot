// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: element } = await import('react');
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => element('span', null, children);
  return {
    ...dialogPrimitives(),
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    Switch: ({
      checked,
      label,
      onChange,
    }: {
      checked: boolean;
      label: string;
      onChange?(next: boolean): void;
    }) =>
      element('input', {
        type: 'checkbox',
        checked,
        'aria-label': label,
        onChange: (event: { target: HTMLInputElement }) => onChange?.(event.target.checked),
      }),
    SegmentedControl: ({
      label,
      value,
      options,
      onChange,
    }: {
      label: string;
      value: string;
      options: { value: string; label: string }[];
      onChange(next: string): void;
    }) =>
      element(
        'div',
        { role: 'tablist', 'aria-label': label },
        ...options.map((option) =>
          element(
            'button',
            {
              key: option.value,
              type: 'button',
              role: 'tab',
              'aria-selected': option.value === value,
              onClick: () => onChange(option.value),
            },
            option.label,
          ),
        ),
      ),
    IconPlusOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import type { BotScheduleView } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  BotSchedulesEntry,
  ScheduleDialog,
  emptyScheduleForm,
  formatScheduleTime,
  scheduleCadenceLabel,
  scheduleFormOf,
  scheduleTriggerOf,
} from '../src/client/schedules-entry.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

const schedule: BotScheduleView = {
  id: 'sch-1',
  botSlug: 'ada',
  title: '每日早报',
  prompt: 'Summarise overnight changes',
  trigger: { kind: 'every', everySeconds: 7200 },
  enabled: true,
  creator: 'human',
  locked: false,
  nextRunAt: '2026-10-06T09:00:00.000Z',
  lastFiring: {
    id: 'f-1',
    scheduleId: 'sch-1',
    trigger: 'planned',
    occurrenceAt: '2026-10-06T07:00:00.000Z',
    firedAt: '2026-10-06T07:00:00.000Z',
    state: 'handled',
    sessionId: 'session-1',
  },
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
};

describe('Bot Schedule form helpers', () => {
  it('turns minute, hour and daily forms into triggers', () => {
    const form = emptyScheduleForm('Asia/Shanghai');
    expect(scheduleTriggerOf(form)).toEqual({ kind: 'every', everySeconds: 3600 });
    expect(scheduleTriggerOf({ ...form, unit: 'minutes', every: '5' })).toEqual({
      kind: 'every',
      everySeconds: 300,
    });
    expect(scheduleTriggerOf({ ...form, unit: 'daily', time: '08:30' })).toEqual({
      kind: 'daily',
      time: '08:30',
      timeZone: 'Asia/Shanghai',
    });
    expect(scheduleTriggerOf({ ...form, every: '0' })).toBeUndefined();
    expect(scheduleTriggerOf({ ...form, every: '1.5' })).toBeUndefined();
    expect(scheduleTriggerOf({ ...form, unit: 'daily', time: '8' })).toBeUndefined();
  });

  it('turns weekly, once and cron forms into triggers', () => {
    const form = emptyScheduleForm('Asia/Shanghai', new Date(2026, 9, 6, 8, 0));
    expect(form.date).toBe('2026-10-07');
    expect(scheduleTriggerOf({ ...form, unit: 'weekly', weekdays: [5, 1, 5] })).toEqual({
      kind: 'weekly',
      time: '09:00',
      timeZone: 'Asia/Shanghai',
      weekdays: [1, 5],
    });
    expect(scheduleTriggerOf({ ...form, unit: 'weekly', weekdays: [] })).toBeUndefined();
    expect(scheduleTriggerOf({ ...form, unit: 'once', time: '18:30' })).toEqual({
      kind: 'once',
      date: '2026-10-07',
      time: '18:30',
      timeZone: 'Asia/Shanghai',
    });
    expect(scheduleTriggerOf({ ...form, unit: 'once', date: '' })).toBeUndefined();
    expect(scheduleTriggerOf({ ...form, unit: 'cron', expression: ' 0  9 * * 1-5 ' })).toEqual({
      kind: 'cron',
      expression: '0 9 * * 1-5',
      timeZone: 'Asia/Shanghai',
    });
    expect(scheduleTriggerOf({ ...form, unit: 'cron', expression: ' ' })).toBeUndefined();
    expect(scheduleTriggerOf({ ...form, unit: 'cron', timeZone: '' })).toBeUndefined();
  });

  it('round-trips a stored schedule into the editor form', () => {
    expect(scheduleFormOf(schedule)).toMatchObject({ unit: 'hours', every: '2', locked: false });
    expect(scheduleFormOf({ ...schedule, locked: true }).locked).toBe(true);
    expect(
      scheduleFormOf({ ...schedule, trigger: { kind: 'every', everySeconds: 900 } }),
    ).toMatchObject({ unit: 'minutes', every: '15' });
    expect(
      scheduleFormOf({
        ...schedule,
        trigger: { kind: 'daily', time: '09:15', timeZone: 'Asia/Tokyo' },
      }),
    ).toMatchObject({ unit: 'daily', time: '09:15', timeZone: 'Asia/Tokyo' });
    expect(
      scheduleFormOf({
        ...schedule,
        trigger: { kind: 'weekly', time: '10:00', timeZone: 'UTC', weekdays: [2, 4] },
      }),
    ).toMatchObject({ unit: 'weekly', time: '10:00', weekdays: [2, 4] });
    expect(
      scheduleFormOf({
        ...schedule,
        trigger: { kind: 'once', date: '2026-12-31', time: '23:00', timeZone: 'UTC' },
      }),
    ).toMatchObject({ unit: 'once', date: '2026-12-31', time: '23:00' });
    expect(
      scheduleFormOf({
        ...schedule,
        trigger: { kind: 'cron', expression: '*/30 * * * *', timeZone: 'UTC' },
      }),
    ).toMatchObject({ unit: 'cron', expression: '*/30 * * * *' });
  });

  it('labels cadences', () => {
    expect(scheduleCadenceLabel({ kind: 'every', everySeconds: 60 }, zhTranslate)).toBe('每分钟');
    expect(scheduleCadenceLabel({ kind: 'every', everySeconds: 600 }, zhTranslate)).toBe(
      '每 10 分钟',
    );
    expect(scheduleCadenceLabel({ kind: 'every', everySeconds: 3600 }, zhTranslate)).toBe('每小时');
    expect(scheduleCadenceLabel({ kind: 'every', everySeconds: 10800 }, zhTranslate)).toBe(
      '每 3 小时',
    );
    expect(
      scheduleCadenceLabel({ kind: 'daily', time: '09:00', timeZone: 'UTC' }, zhTranslate),
    ).toBe('每天 09:00');
    const weekly = (weekdays: number[]) =>
      scheduleCadenceLabel(
        { kind: 'weekly', time: '09:00', timeZone: 'UTC', weekdays },
        zhTranslate,
      );
    expect(weekly([1, 2, 3, 4, 5])).toBe('工作日 09:00');
    expect(weekly([6, 7])).toBe('周末 09:00');
    expect(weekly([1, 3])).toBe('周一、周三 09:00');
    expect(
      scheduleCadenceLabel(
        { kind: 'once', date: '2026-11-01', time: '09:00', timeZone: 'UTC' },
        zhTranslate,
      ),
    ).toBe('单次 11-01 09:00');
    expect(
      scheduleCadenceLabel(
        { kind: 'cron', expression: '0 9 * * 1-5', timeZone: 'UTC' },
        zhTranslate,
      ),
    ).toBe('Cron 0 9 * * 1-5');
  });

  it('shows the date only when the next run is not today', () => {
    const now = new Date(2026, 9, 6, 8, 0);
    expect(formatScheduleTime(new Date(2026, 9, 6, 9, 5).toISOString(), now)).toBe('09:05');
    expect(formatScheduleTime(new Date(2026, 9, 7, 9, 5).toISOString(), now)).toBe('10-07 09:05');
  });
});

describe('Bot Schedules sidebar entry', () => {
  it('lists schedules with cadence, last firing and creator chips', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const actions = {
      botSchedules: vi.fn(async () => [schedule]),
      botScheduleHistory: vi.fn(async () => []),
      updateBotSchedule: vi.fn(async () => ({ ...schedule, locked: true })),
      runBotScheduleNow: vi.fn(async () => ({ ...schedule.lastFiring, trigger: 'manual' })),
    } as unknown as BridgeActions;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(BotSchedulesEntry, {
          scope: 'personabot',
          channelId: 'dm-ada',
          botSlug: 'ada',
          actions,
          t: zhTranslate,
        } as never),
      );
    });
    expect(actions.botSchedules).toHaveBeenCalledWith('ada');
    const text = host.textContent ?? '';
    expect(text).toContain('每日早报');
    expect(text).toContain('每 2 小时');
    expect(text).toContain('已处理');
    expect(host.querySelector('[aria-label="由你创建"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="启用「每日早报」"]')).not.toBeNull();
    const lock = host.querySelector<HTMLButtonElement>('button.bh-schedule-lock-toggle');
    expect(lock?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => lock?.click());
    expect(actions.updateBotSchedule).toHaveBeenCalledWith('ada', 'sch-1', { locked: true });
    const runNow = host.querySelector<HTMLButtonElement>('button.bh-schedule-run-now');
    expect(runNow?.getAttribute('aria-label')).toBe('立即运行「每日早报」');
    await act(async () => runNow?.click());
    expect(actions.runBotScheduleNow).toHaveBeenCalledWith('ada', 'sch-1');
    expect(host.textContent).toContain('已触发，Bot 马上处理');
    await act(async () => root.unmount());
    host.remove();
  });
});

describe('Bot Schedule dialog opened from the Bot Inbox', () => {
  async function render(
    rows: BotScheduleView[],
  ): Promise<{ host: HTMLElement; done(): Promise<void> }> {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const actions = {
      botSchedules: vi.fn(async () => rows),
      botScheduleHistory: vi.fn(async () => (rows.length === 0 ? [] : [schedule.lastFiring])),
      botSchedulePreview: vi.fn(async () => [
        '2026-10-06T09:00:00.000Z',
        '2026-10-06T11:00:00.000Z',
        '2026-10-06T13:00:00.000Z',
      ]),
    } as unknown as BridgeActions;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(ScheduleDialog, {
          botSlug: 'ada',
          scheduleId: 'sch-1',
          actions,
          t: zhTranslate,
          onClose: () => undefined,
        }),
      );
    });
    return {
      host,
      done: async () => {
        await act(async () => root.unmount());
        host.remove();
      },
    };
  }

  it('loads the schedule with its firing history and previews the next runs', async () => {
    const { host, done } = await render([schedule]);
    expect(host.textContent).toContain('最近触发');
    expect(host.textContent).toContain('已处理');
    expect(host.querySelector('[data-schedule-preview]')?.textContent).toContain('正在计算');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(host.querySelectorAll('[data-schedule-preview] li')).toHaveLength(3);
    await done();
  });

  it('says when the schedule was deleted', async () => {
    const { host, done } = await render([]);
    expect(host.textContent).toContain('这个定时任务已被删除。');
    await done();
  });
});

describe('Bot Schedule editor dialog', () => {
  async function open(
    scheduleId: string | undefined,
    extra: Record<string, unknown> = {},
  ): Promise<{
    actions: Record<string, ReturnType<typeof vi.fn>>;
    onClose: ReturnType<typeof vi.fn>;
    done(): Promise<void>;
  }> {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const actions = {
      botSchedules: vi.fn(async () => [schedule]),
      botScheduleHistory: vi.fn(async () => []),
      botSchedulePreview: vi.fn(async () => ['2026-10-06T09:00:00.000Z']),
      createBotSchedule: vi.fn(async () => schedule),
      updateBotSchedule: vi.fn(async () => schedule),
      deleteBotSchedule: vi.fn(async () => undefined),
      ...extra,
    };
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(ScheduleDialog, {
          botSlug: 'ada',
          scheduleId,
          actions: actions as unknown as BridgeActions,
          t: zhTranslate,
          onClose,
        }),
      );
    });
    return {
      actions,
      onClose,
      done: async () => {
        await act(async () => root.unmount());
        host.remove();
      },
    };
  }

  async function typeArea(label: string, value: string): Promise<void> {
    const field = [...document.querySelectorAll('label')].find((l) => l.textContent === label);
    const area = document.getElementById(field!.htmlFor) as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(area, value);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('creates a schedule only once the name, task and cadence are complete', async () => {
    const { actions, onClose, done } = await open(undefined);
    try {
      expect(dialog().getAttribute('aria-label')).toBe('新建定时任务');
      expect(buttonNamed('创建').disabled).toBe(true);
      await typeInto(fieldNamed('名称'), '每日早报');
      await typeArea('要 Bot 做什么', 'Summarise');
      await act(async () => buttonNamed('每周').click());
      await typeInto(fieldNamed('时区'), 'Asia/Shanghai');
      expect(buttonNamed('周一').getAttribute('aria-pressed')).toBe('true');
      await act(async () => buttonNamed('周一').click());
      expect(buttonNamed('周一').getAttribute('aria-pressed')).toBe('false');
      await act(async () =>
        document.querySelector<HTMLInputElement>('[aria-label="锁定"]')!.click(),
      );
      await act(async () => dialog().querySelector('form')!.requestSubmit());
      expect(actions.createBotSchedule).toHaveBeenCalledWith('ada', {
        title: '每日早报',
        prompt: 'Summarise',
        trigger: {
          kind: 'weekly',
          time: '09:00',
          timeZone: 'Asia/Shanghai',
          weekdays: [2, 3, 4, 5],
        },
        locked: true,
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      await done();
    }
  });

  it('warns about short intervals and keeps the dialog open with the Host error', async () => {
    const { actions, onClose, done } = await open(undefined, {
      createBotSchedule: vi.fn(async () => {
        throw new Error('Schedule limit reached');
      }),
    });
    try {
      await typeInto(fieldNamed('名称'), 'Ping');
      await typeArea('要 Bot 做什么', 'Check');
      await act(async () => buttonNamed('按分钟').click());
      await typeInto(fieldNamed('每隔几分钟'), '5');
      expect(document.querySelector('[role="note"]')?.textContent).toContain('15 分钟');
      await act(async () => buttonNamed('创建').click());
      expect(actions.createBotSchedule).toHaveBeenCalledTimes(1);
      expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('Schedule limit reached');
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      await done();
    }
  });

  it('asks again before deleting an existing schedule', async () => {
    const { actions, onClose, done } = await open('sch-1');
    try {
      expect(dialog().getAttribute('aria-label')).toBe('编辑定时任务');
      expect(fieldNamed('名称').value).toBe('每日早报');
      await act(async () => buttonNamed('删除').click());
      expect(actions.deleteBotSchedule).not.toHaveBeenCalled();
      await act(async () => buttonNamed('确认删除').click());
      expect(actions.deleteBotSchedule).toHaveBeenCalledWith('ada', 'sch-1');
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      await done();
    }
  });

  it('closes the deleted-schedule notice from its footer', async () => {
    const { onClose, done } = await open('sch-1', { botSchedules: vi.fn(async () => []) });
    try {
      expect(dialog().textContent).toContain('这个定时任务已被删除。');
      await act(async () => dialog().querySelector('form')!.requestSubmit());
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      await done();
    }
  });
});
