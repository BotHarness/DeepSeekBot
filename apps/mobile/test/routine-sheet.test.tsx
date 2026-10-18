// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('../src/ui/shell/icons', () => ({
  ChevronRightIcon: () => null,
  CloseIcon: () => null,
}));

import type { Routines } from '../src/host/routines';
import type { BotScheduleFiring, BotScheduleSummary } from '../src/host/wire';
import { RoutineSheet } from '../src/ui/chat/routine-sheet';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  vi.useRealTimers();
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const digest: BotScheduleSummary = {
  id: 'digest',
  title: 'Morning digest',
  prompt: 'Summarize new papers',
  trigger: { kind: 'daily', time: '09:00', timeZone: 'Asia/Tokyo' },
  enabled: true,
  nextRunAt: '2026-10-16T00:00:00.000Z',
};

const firing = (id: string, at: string, trigger: 'manual' | 'planned'): BotScheduleFiring => ({
  id,
  scheduleId: 'digest',
  trigger,
  occurrenceAt: at,
  firedAt: at,
  state: 'handled',
});

function fakeRoutines(): Routines & { [K in keyof Routines]: ReturnType<typeof vi.fn> } {
  let history = [firing('f1', '2026-10-14T00:00:00.000Z', 'planned')];
  return {
    list: vi.fn(async () => [digest]),
    history: vi.fn(async () => history),
    runNow: vi.fn(async () => {
      const next = firing('f2', '2026-10-15T14:00:00.000Z', 'manual');
      history = [...history, next];
      return next;
    }),
    setEnabled: vi.fn(async (_id: string, enabled: boolean) => ({ ...digest, enabled })),
    remove: vi.fn(async () => undefined),
    preview: vi.fn(async () => ['2026-10-16T00:00:00.000Z', '2026-10-17T00:00:00.000Z']),
    create: vi.fn(async () => ({ ...digest, id: 'new' })),
    update: vi.fn(async () => digest),
  } as never;
}

const button = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)].at(-1) ?? null;
const field = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!;

async function type(view: HTMLElement, label: string, value: string) {
  const input = field(view, label);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Routine sheet', () => {
  it('uses an in-drawer page for detail and routes Edit to its child page', async () => {
    const onEdit = vi.fn();
    const view = await render(
      <RoutineSheet
        page={({ children }) => <main>{children}</main>}
        botName="Ada"
        target={{ kind: 'open', routine: digest }}
        routines={fakeRoutines()}
        onChanged={vi.fn()}
        onClose={vi.fn()}
        onOpenFullClient={vi.fn()}
        onEdit={onEdit}
      />,
    );
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => button(view, t.routineEdit)!.click());
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(view.textContent).toContain(t.routineRunNow);
  });

  it('retains a failed edit on its pushed page and returns only after a successful retry', async () => {
    const routines = fakeRoutines();
    routines.update.mockRejectedValueOnce(new Error('offline'));
    const onClose = vi.fn();
    const view = await render(
      <RoutineSheet
        page={({ children }) => <main>{children}</main>}
        initialMode="edit"
        botName="Ada"
        target={{ kind: 'open', routine: digest }}
        routines={routines}
        onChanged={vi.fn()}
        onClose={onClose}
        onOpenFullClient={vi.fn()}
      />,
    );
    await type(view, t.routineTitleLabel, 'Evening digest');
    await act(async () => button(view, t.routineSave)!.click());
    expect(view.textContent).toContain('offline');
    expect(field(view, t.routineTitleLabel).value).toBe('Evening digest');
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => button(view, t.routineSave)!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the trigger, next run and recent runs, and runs the routine now', async () => {
    const routines = fakeRoutines();
    const onChanged = vi.fn();
    const view = await render(
      <RoutineSheet
        botName="Ada"
        target={{ kind: 'open', routine: digest }}
        routines={routines}
        onChanged={onChanged}
        onClose={vi.fn()}
        onOpenFullClient={vi.fn()}
      />,
    );
    const text = view.textContent ?? '';
    expect(text).toContain('Morning digest');
    expect(text).toContain(t.routineDaily('09:00'));
    expect(text).toContain('Summarize new papers');
    expect(text).toContain(`${t.routineRunKind.planned} · ${t.routineRunState.handled}`);
    expect(routines.history).toHaveBeenCalledWith('digest');

    await act(async () => button(view, t.routineRunNow)!.click());
    await act(async () => undefined);
    expect(routines.runNow).toHaveBeenCalledWith('digest');
    expect(view.textContent).toContain(t.routineStarted);
    expect(view.textContent).toContain(`${t.routineRunKind.manual} · ${t.routineRunState.handled}`);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('pauses and resumes, and deletes only after confirming', async () => {
    const routines = fakeRoutines();
    const onClose = vi.fn();
    const view = await render(
      <RoutineSheet
        botName="Ada"
        target={{ kind: 'open', routine: digest }}
        routines={routines}
        onChanged={vi.fn()}
        onClose={onClose}
        onOpenFullClient={vi.fn()}
      />,
    );
    await act(async () => button(view, t.routinePause)!.click());
    expect(routines.setEnabled).toHaveBeenLastCalledWith('digest', false);
    expect(view.textContent).toContain(t.routineOff);
    await act(async () => button(view, t.routineResume)!.click());
    expect(routines.setEnabled).toHaveBeenLastCalledWith('digest', true);

    await act(async () => button(view, t.routineDelete)!.click());
    expect(view.textContent).toContain(t.routineDeleteConfirm('Morning digest'));
    expect(routines.remove).not.toHaveBeenCalled();
    await act(async () => button(view, t.cancel)!.click());
    expect(button(view, t.routineRunNow)).not.toBeNull();

    await act(async () => button(view, t.routineDelete)!.click());
    await act(async () => button(view, t.routineDelete)!.click());
    expect(routines.remove).toHaveBeenCalledWith('digest');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Delete named for VoiceOver while another action runs', async () => {
    const routines = fakeRoutines();
    routines.runNow.mockReturnValueOnce(new Promise(() => undefined));
    const view = await render(
      <RoutineSheet
        botName="Ada"
        target={{ kind: 'open', routine: digest }}
        routines={routines}
        onChanged={vi.fn()}
        onClose={vi.fn()}
        onOpenFullClient={vi.fn()}
      />,
    );
    await act(async () => button(view, t.routineRunNow)!.click());
    await act(async () => button(view, t.routineDelete)!.click());
    expect(view.textContent).not.toContain(t.routineDeleteConfirm('Morning digest'));
  });

  it('shows the Host refusal in place', async () => {
    const routines = fakeRoutines();
    routines.runNow.mockRejectedValueOnce(new Error('Bot Schedule digest is inactive'));
    const view = await render(
      <RoutineSheet
        botName="Ada"
        target={{ kind: 'open', routine: digest }}
        routines={routines}
        onChanged={vi.fn()}
        onClose={vi.fn()}
        onOpenFullClient={vi.fn()}
      />,
    );
    await act(async () => button(view, t.routineRunNow)!.click());
    expect(view.textContent).toContain(`${t.routineFailed} Bot Schedule digest is inactive`);
  });

  it('sends a schedule the phone cannot edit to the full client', async () => {
    const onOpenFullClient = vi.fn();
    const view = await render(
      <RoutineSheet
        botName="Ada"
        target={{
          kind: 'open',
          routine: {
            ...digest,
            trigger: { kind: 'cron', expression: '0 9 * * 1', timeZone: 'UTC' },
          },
        }}
        routines={fakeRoutines()}
        onChanged={vi.fn()}
        onClose={vi.fn()}
        onOpenFullClient={onOpenFullClient}
      />,
    );
    expect(view.textContent).toContain(t.routineAdvanced);
    await act(async () => button(view, t.routineEdit)!.click());
    expect(onOpenFullClient).toHaveBeenCalled();
  });

  it('creates a weekly routine once the form is complete, previewing the next runs', async () => {
    vi.useFakeTimers();
    const routines = fakeRoutines();
    const onChanged = vi.fn();
    const onClose = vi.fn();
    const view = await render(
      <RoutineSheet
        botName="Ada"
        target={{ kind: 'new' }}
        routines={routines}
        onChanged={onChanged}
        onClose={onClose}
        onOpenFullClient={vi.fn()}
      />,
    );
    await act(async () => vi.runAllTimers());
    expect(routines.preview).toHaveBeenCalledWith(expect.objectContaining({ kind: 'daily' }));
    expect(view.textContent).toContain(t.routineProblem.title);
    expect(button(view, t.routineCreate)!.disabled).toBe(true);

    await type(view, t.routineTitleLabel, 'Weekly review');
    await type(view, t.routineInstruction, 'Review the week');
    await act(async () => button(view, t.routineCadence.weekly)!.click());
    await act(async () => button(view, t.weekdayShort(1))!.click());
    await act(async () => button(view, t.weekdayShort(7))!.click());
    await type(view, t.routineTime, '18:30');
    await act(async () => vi.runAllTimers());
    expect(routines.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'weekly', time: '18:30', weekdays: [2, 3, 4, 5, 7] }),
    );
    expect(button(view, t.routineCreate)!.disabled).toBe(false);

    await act(async () => button(view, t.routineCreate)!.click());
    expect(routines.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Weekly review',
        prompt: 'Review the week',
        cadence: 'weekly',
        time: '18:30',
        weekdays: [2, 3, 4, 5, 7],
      }),
    );
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('edits an existing routine from its current schedule', async () => {
    const routines = fakeRoutines();
    const view = await render(
      <RoutineSheet
        botName="Ada"
        target={{ kind: 'open', routine: digest }}
        routines={routines}
        onChanged={vi.fn()}
        onClose={vi.fn()}
        onOpenFullClient={vi.fn()}
      />,
    );
    await act(async () => button(view, t.routineEdit)!.click());
    expect(field(view, t.routineTitleLabel).value).toBe('Morning digest');
    expect(field(view, t.routineTime).value).toBe('09:00');
    await act(async () => button(view, t.routineCadence.hours)!.click());
    await type(view, t.routineHours, '4');
    await act(async () => button(view, t.routineSave)!.click());
    expect(routines.update).toHaveBeenCalledWith(
      'digest',
      expect.objectContaining({ cadence: 'hours', hours: '4', title: 'Morning digest' }),
    );
    expect(button(view, t.routineRunNow)).not.toBeNull();
  });
});
