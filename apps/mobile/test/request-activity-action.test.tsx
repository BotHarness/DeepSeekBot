// @vitest-environment jsdom
import { interfacePreferences } from '../src/ui/interface-preferences';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DialogAction } from '../src/ui/primitives/dialog-state';

const activity = vi.hoisted(() => ({
  state: { ready: true, busy: false, tracking: false, target: { hostId: 'a', messageId: 'old' } },
  start: vi.fn<() => Promise<void>>(),
  stop: vi.fn<() => Promise<void>>(),
  actions: [] as readonly DialogAction[],
  result: undefined as unknown,
}));
vi.mock('../src/host/native-live-activity', () => ({
  requestActivitySession: activity,
  useRequestActivity: () => activity.state,
}));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  showAppDialog: (_title: string, _body: string, actions: readonly DialogAction[]) => {
    activity.actions = actions;
  },
}));
import { useRequestActivityAction } from '../src/ui/chat/request-activity-action';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let view: HTMLDivElement;
function Action({ messageId }: { messageId: string }) {
  const action = useRequestActivityAction({
    hostId: 'a',
    channelId: 'dm',
    botSlug: 'ada',
    messageId,
  });
  return (
    <button
      disabled={action.disabled}
      onClick={() => {
        activity.result = action.onPress();
      }}
    >
      {action.label}
    </button>
  );
}
beforeEach(() => {
  interfacePreferences.setLanguage('en');
  activity.state.tracking = false;
  activity.actions = [];
  activity.result = undefined;
  activity.start.mockReset().mockResolvedValue(undefined);
  activity.stop.mockReset().mockResolvedValue(undefined);
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
});
afterEach(() => {
  act(() => root?.unmount());
  view.remove();
});

it.each(['start', 'stop', 'switch'] as const)(
  'returns the %s promise and shows pending feedback immediately',
  async (operation) => {
    activity.state.tracking = operation !== 'start';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (operation === 'stop') activity.stop.mockReturnValue(gate);
    else activity.start.mockReturnValue(gate);
    await act(async () =>
      root!.render(<Action messageId={operation === 'stop' ? 'old' : 'new'} />),
    );
    const button = view.querySelector('button')!;
    let result: unknown;
    await act(async () => {
      button.click();
      result = activity.result;
      if (operation !== 'stop') {
        const label = operation === 'start' ? t.lockScreen.track : t.lockScreen.switch;
        result = activity.actions.find((action) => action.text === label)?.onPress?.();
      }
    });
    expect(result).toBeInstanceOf(Promise);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(
      operation === 'start' ? 'Starting…' : operation === 'stop' ? 'Stopping…' : 'Switching…',
    );
    await act(async () => {
      release();
      await result;
    });
    expect(button.disabled).toBe(false);
    if (operation === 'switch') expect(activity.stop).toHaveBeenCalledTimes(1);
  },
);
