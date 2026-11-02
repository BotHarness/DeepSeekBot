import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createHapticPreferences } from '../src/host/haptic-feedback';

const disk = vi.hoisted(() => ({
  value: undefined as string | undefined,
  readGate: undefined as Promise<string | undefined> | undefined,
  fail: false,
}));
const feedback = vi.hoisted(() => ({ played: [] as string[] }));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    get exists() {
      return disk.value !== undefined;
    }
    create() {}
    async text() {
      return disk.readGate ?? disk.value;
    }
    writeSync(value: string) {
      if (disk.fail) throw new Error('disk unavailable');
      disk.value = value;
    }
  },
}));
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  AndroidHaptics: {
    Segment_Tick: 'segment-tick',
    Confirm: 'confirm',
    Reject: 'reject',
    Context_Click: 'context-click',
  },
  performAndroidHapticsAsync: vi.fn(async (type: string) => {
    feedback.played.push(`android:${type}`);
  }),
  selectionAsync: vi.fn(async () => {
    feedback.played.push('selection');
  }),
  impactAsync: vi.fn(async (style: string) => {
    feedback.played.push(`impact:${style}`);
  }),
  notificationAsync: vi.fn(async (type: string) => {
    feedback.played.push(`notification:${type}`);
  }),
}));

beforeEach(() => {
  vi.resetModules();
  disk.value = undefined;
  disk.readGate = undefined;
  disk.fail = false;
});
afterEach(() => vi.resetModules());

it('does not play a startup haptic before a saved off preference finishes loading', async () => {
  disk.value = 'false';
  let finishRead!: (value: string) => void;
  disk.readGate = new Promise((resolve) => (finishRead = resolve));
  const { hapticPreferences } = await import('../src/host/native-haptic-feedback');
  const { haptic } = await import('../src/ui/haptics');
  feedback.played.length = 0;
  expect(hapticPreferences.getSnapshot().loaded).toBe(false);
  haptic('selection');
  expect(feedback.played).toEqual([]);
  finishRead('false');
  await hapticPreferences.ready;
  haptic('send');
  expect(feedback.played).toEqual([]);
});

it('defaults on, disables every application moment, and restores the device choice after restart', async () => {
  const { hapticPreferences } = await import('../src/host/native-haptic-feedback');
  const { haptic } = await import('../src/ui/haptics');
  const { played } = feedback;
  played.length = 0;
  await hapticPreferences.ready;
  expect(hapticPreferences.getSnapshot().enabled).toBe(true);
  haptic('selection');
  expect(played).toEqual(['selection']);
  hapticPreferences.setEnabled(false);
  for (const moment of [
    'send',
    'approve',
    'deny',
    'submit',
    'menu',
    'pull',
    'react',
    'selection',
  ] as const)
    haptic(moment);
  expect(played).toEqual(['selection']);
  expect(JSON.parse(disk.value!)).toBe(false);
  vi.resetModules();
  const { hapticPreferences: restarted } = await import('../src/host/native-haptic-feedback');
  const { haptic: restoredHaptic } = await import('../src/ui/haptics');
  const { played: restoredPlayed } = feedback;
  restoredPlayed.length = 0;
  restoredHaptic('selection');
  expect(restoredPlayed).toEqual([]);
  await restarted.ready;
  expect(restarted.getSnapshot().enabled).toBe(false);
  restoredHaptic('send');
  expect(restoredPlayed).toEqual([]);
});

it('keeps an explicit choice when the initial read completes later', async () => {
  let finishRead!: (value: unknown) => void;
  const write = vi.fn();
  const preferences = createHapticPreferences({
    read: () => new Promise((resolve) => (finishRead = resolve)),
    write,
  });
  preferences.setEnabled(false);
  finishRead(true);
  await preferences.ready;
  expect(preferences.getSnapshot()).toEqual({ enabled: false, loaded: true, storageError: false });
  expect(write).toHaveBeenCalledExactlyOnceWith(false);
});

it('keeps the current off choice after a failed write and recovers on a later save', async () => {
  const { hapticPreferences } = await import('../src/host/native-haptic-feedback');
  const { haptic } = await import('../src/ui/haptics');
  const { played } = feedback;
  played.length = 0;
  await hapticPreferences.ready;
  disk.fail = true;
  hapticPreferences.setEnabled(false);
  expect(hapticPreferences.getSnapshot()).toEqual({
    enabled: false,
    loaded: true,
    storageError: true,
  });
  haptic('approve');
  expect(played).toEqual([]);
  disk.fail = false;
  hapticPreferences.setEnabled(true);
  expect(hapticPreferences.getSnapshot().storageError).toBe(false);
  haptic('deny');
  expect(played).toEqual(['notification:warning']);
});

it.each(['not-json', '"invalid"'])('contains an unreadable saved preference: %s', async (value) => {
  disk.value = value;
  const { hapticPreferences } = await import('../src/host/native-haptic-feedback');
  await hapticPreferences.ready;
  expect(hapticPreferences.getSnapshot()).toEqual({
    enabled: true,
    loaded: true,
    storageError: true,
  });
});

it('contains synchronous and asynchronous provider failures', async () => {
  const { hapticPreferences } = await import('../src/host/native-haptic-feedback');
  const { haptic } = await import('../src/ui/haptics');
  const provider = await import('expo-haptics');
  await hapticPreferences.ready;
  const selection = vi.spyOn(provider, 'selectionAsync').mockImplementationOnce(() => {
    throw new Error('native module unavailable');
  });
  expect(() => haptic('selection')).not.toThrow();
  selection.mockRejectedValueOnce(new Error('device unavailable'));
  expect(() => haptic('selection')).not.toThrow();
  await Promise.resolve();
  selection.mockRestore();
});

it('uses Android system feedback rather than a simulated vibration waveform', async () => {
  const { playHaptic } = await import('../src/ui/haptic-effect.android');
  feedback.played.length = 0;
  await playHaptic('selection');
  await playHaptic('approve');
  await playHaptic('deny');
  await playHaptic('menu');
  expect(feedback.played).toEqual([
    'android:segment-tick',
    'android:confirm',
    'android:reject',
    'android:context-click',
  ]);
});
