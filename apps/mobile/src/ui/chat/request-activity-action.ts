import { showAppDialog } from '../primitives/app-dialog';
import { useRef, useState } from 'react';
import { ActivityRequestFailed } from '../../host/live-activity';
import type { ActivityTarget } from '../../host/live-activity-session';
import { requestActivitySession, useRequestActivity } from '../../host/native-live-activity';
import { useStrings } from '../strings';

export function useRequestActivityAction(target: ActivityTarget | undefined) {
  const t = useStrings();
  const state = useRequestActivity();
  const [pending, setPending] = useState<'starting' | 'stopping' | 'switching'>();
  const pendingRef = useRef(false);
  const same =
    state.tracking &&
    state.target?.hostId === target?.hostId &&
    state.target?.messageId === target?.messageId;
  const busy = pending !== undefined || state.busy;
  const label = pending
    ? t.lockScreen[pending]
    : state.busy
      ? t.lockScreen.updating
      : same || (state.tracking && !target)
        ? t.lockScreen.stop
        : t.lockScreen.track;
  const failed = (error: unknown) =>
    showAppDialog(
      t.lockScreen.title,
      error instanceof ActivityRequestFailed && error.code === 'activity-native-unavailable'
        ? t.lockScreen.disabled
        : error instanceof ActivityRequestFailed &&
            [
              'activity-ended',
              'activity-request-not-found',
              'activity-request-unavailable',
            ].includes(error.code)
          ? t.lockScreen.noRequest
          : t.lockScreen.unavailable,
      [{ text: t.close }],
    );
  const run = async (
    operation: NonNullable<typeof pending>,
    work: () => Promise<void>,
    failure: (error: unknown) => void,
  ) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(operation);
    try {
      await work();
    } catch (error) {
      failure(error);
    } finally {
      pendingRef.current = false;
      setPending(undefined);
    }
  };
  const start = () =>
    run(
      'starting',
      async () => {
        if (target) await requestActivitySession.start(target);
      },
      failed,
    );
  const stop = () =>
    run(
      'stopping',
      () => requestActivitySession.stop(),
      () => showAppDialog(t.lockScreen.title, t.lockScreen.stoppedOffline, [{ text: t.close }]),
    );
  return {
    label,
    busy,
    disabled: busy || !state.ready || (!target && !state.tracking),
    onPress() {
      if (busy || pendingRef.current) return;
      if (same || !target) {
        return stop();
      }
      if (state.tracking)
        showAppDialog(t.lockScreen.title, t.lockScreen.switchBody, [
          { text: t.cancel, style: 'cancel' },
          { text: t.lockScreen.stop, onPress: stop },
          {
            text: t.lockScreen.switch,
            onPress: () =>
              run(
                'switching',
                async () => {
                  await requestActivitySession.stop();
                  await requestActivitySession.start(target);
                },
                failed,
              ),
          },
        ]);
      else
        showAppDialog(t.lockScreen.title, t.lockScreen.startBody, [
          { text: t.cancel, style: 'cancel' },
          { text: t.lockScreen.track, onPress: start },
        ]);
    },
  };
}
