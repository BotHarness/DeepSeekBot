import { afterEach, describe, expect, it, vi } from 'vitest';

const { platform, nativeAlert } = vi.hoisted(() => ({
  platform: { OS: 'android' },
  nativeAlert: vi.fn(),
}));
vi.mock('react-native', () => ({
  Platform: platform,
  Alert: { alert: nativeAlert },
  Keyboard: { dismiss() {} },
}));

import { showAppDialog } from '../src/ui/primitives/app-dialog';
import { appDialogs, createDialogState } from '../src/ui/primitives/dialog-state';

afterEach(() => {
  appDialogs.dismiss();
  nativeAlert.mockReset();
  platform.OS = 'android';
});

describe('app dialogs', () => {
  it('routes Android through the app surface and leaves iOS native', () => {
    showAppDialog('Unpair?', 'Phone only', [{ text: 'Cancel', style: 'cancel' }]);
    expect(nativeAlert).not.toHaveBeenCalled();
    expect(appDialogs.getSnapshot()?.title).toBe('Unpair?');
    appDialogs.dismiss();
    platform.OS = 'ios';
    showAppDialog('Unpair?', 'Phone only', [{ text: 'Cancel', style: 'cancel' }]);
    expect(nativeAlert).toHaveBeenCalledWith('Unpair?', 'Phone only', [
      { text: 'Cancel', style: 'cancel' },
    ]);
    expect(appDialogs.getSnapshot()).toBeUndefined();
  });

  it('keeps semantic icons in the Android menu but strips them from native iOS alert buttons', () => {
    showAppDialog('Create', undefined, [{ text: 'New Bot', icon: 'person' }]);
    expect(appDialogs.getSnapshot()?.actions[0]?.icon).toBe('person');
    appDialogs.dismiss();
    platform.OS = 'ios';
    showAppDialog('Create', undefined, [{ text: 'New Bot', icon: 'person' }]);
    expect(nativeAlert).toHaveBeenCalledWith('Create', undefined, [{ text: 'New Bot' }]);
  });

  it('cancel, Back and backdrop dismissal never execute a destructive action', async () => {
    const state = createDialogState();
    const remove = vi.fn();
    const actions = [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Unpair', style: 'destructive' as const, onPress: remove },
    ];
    state.open('Unpair?', undefined, actions);
    await state.choose(0, state.getSnapshot()!.id);
    expect(state.getSnapshot()).toBeUndefined();
    state.open('Unpair?', undefined, actions);
    state.dismiss();
    expect(state.getSnapshot()).toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the second confirmation instead of closing it with its menu', async () => {
    const state = createDialogState();
    const remove = vi.fn();
    state.open('Computer', undefined, [
      {
        text: 'Unpair',
        onPress: () => state.open('Unpair?', undefined, [{ text: 'Confirm', onPress: remove }]),
      },
    ]);
    await state.choose(0, state.getSnapshot()!.id);
    expect(state.getSnapshot()?.title).toBe('Unpair?');
    expect(remove).not.toHaveBeenCalled();
    await state.choose(0, state.getSnapshot()!.id);
    expect(remove).toHaveBeenCalledOnce();
    expect(state.getSnapshot()).toBeUndefined();
  });

  it('rejects a repeated menu callback after a destructive confirmation replaces it', async () => {
    const state = createDialogState();
    const remove = vi.fn();
    state.open('Member', undefined, [
      { text: 'Open profile' },
      {
        text: 'Remove',
        onPress: () =>
          state.open('Remove member?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: remove },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
    const menuId = state.getSnapshot()!.id;
    const pressRemove = () => state.choose(1, menuId);
    const first = pressRemove();
    const repeated = pressRemove();
    await Promise.all([first, repeated]);
    expect(state.getSnapshot()?.title).toBe('Remove member?');
    expect(remove).not.toHaveBeenCalled();
    await state.choose(1, state.getSnapshot()!.id);
    expect(remove).toHaveBeenCalledOnce();
  });

  it('executes once, blocks dismiss while saving, then closes after success', async () => {
    const state = createDialogState();
    let finish!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    state.open('Unpair?', undefined, [{ text: 'Unpair', onPress: save }]);
    const first = state.choose(0, state.getSnapshot()!.id);
    await state.choose(0, state.getSnapshot()!.id);
    state.dismiss();
    expect(state.getSnapshot()?.busy).toBe(0);
    expect(save).toHaveBeenCalledOnce();
    finish();
    await first;
    expect(state.getSnapshot()).toBeUndefined();
  });

  it('keeps a refused action open with retry and cancellation available', async () => {
    const state = createDialogState();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(undefined);
    state.open('Unpair?', undefined, [{ text: 'Unpair', onPress: save }]);
    await state.choose(0, state.getSnapshot()!.id);
    expect(state.getSnapshot()).toMatchObject({
      title: 'Unpair?',
      busy: undefined,
      error: 'Offline',
    });
    await state.choose(0, state.getSnapshot()!.id);
    expect(save).toHaveBeenCalledTimes(2);
    expect(state.getSnapshot()).toBeUndefined();
  });

  it('keeps an existing group action refusal visible', async () => {
    const state = createDialogState();
    state.open('Disband?', undefined, [{ text: 'Disband', onPress: async () => false }]);
    await state.choose(0, state.getSnapshot()!.id);
    expect(state.getSnapshot()?.error).toBe('');
    state.dismiss();
    expect(state.getSnapshot()).toBeUndefined();
  });

  it('does not let an older completion dismiss or overwrite a newer request', async () => {
    const state = createDialogState();
    let fail!: (reason: Error) => void;
    state.open('Old', undefined, [
      {
        text: 'Run',
        onPress: () =>
          new Promise<void>((_, reject) => {
            fail = reject;
          }),
      },
    ]);
    const old = state.choose(0, state.getSnapshot()!.id);
    state.open('New', undefined, [{ text: 'Cancel', style: 'cancel' }]);
    fail(new Error('Old failure'));
    await old;
    expect(state.getSnapshot()).toMatchObject({ title: 'New', busy: undefined, error: undefined });
  });
});
