import { usePathname } from 'expo-router';
import { useRef } from 'react';
import { AppState, View, type ViewInstance } from 'react-native';
import { botCreation } from '../../host/native-bot-creation';
import { hostSession } from '../../host/host-session';
import { createCreationVisibility } from '../../host/bot-creation-visibility';
import { useMounted } from '../mounted';
import { showAppDialog } from '../primitives/app-dialog';
import { t } from '../strings';
import { creationCopy as copy } from './bot-creation-copy';

const RETRY_AFTER_FAILURE_MS = 10_000;

export function BotCreationNotice() {
  const path = usePathname();
  const visibility = useRef(createCreationVisibility(AppState.currentState === 'active')).current;
  const mounted = useMounted<ViewInstance>(() => {
    visibility.focus();
    const recover = () => {
      const current = botCreation.getSnapshot();
      if (
        AppState.currentState !== 'active' ||
        !current.loaded ||
        current.busy ||
        hostSession.getState().saved === undefined ||
        current.record.kind !== 'submitted' ||
        current.receipt?.status === 'created'
      )
        return;
      if (current.error && current.error !== 'unreachable' && current.error !== 'invalid-receipt')
        return;
      void botCreation.resume();
    };
    let retry: ReturnType<typeof setTimeout> | undefined;
    const retryAfterFailure = () => {
      const current = botCreation.getSnapshot();
      const failed =
        current.record.kind === 'submitted' &&
        current.receipt?.status !== 'created' &&
        !current.busy &&
        (current.error === 'unreachable' || current.error === 'invalid-receipt');
      if (!failed) {
        clearTimeout(retry);
        retry = undefined;
        return;
      }
      retry ??= setTimeout(() => {
        retry = undefined;
        recover();
      }, RETRY_AFTER_FAILURE_MS);
    };
    const notice = () => {
      if (botCreation.getSnapshot().notice !== 'avatar-failed') return;
      botCreation.dismissNotice();
      showAppDialog(copy.avatarFailedTitle, copy.avatarFailed, [{ text: t.done }]);
    };
    const offNotice = botCreation.subscribe(notice);
    const offRetry = botCreation.subscribe(retryAfterFailure);
    retryAfterFailure();
    recover();
    let live = true;
    void botCreation.ready.then(() => {
      if (live) recover();
    });
    const offHost = hostSession.subscribe(recover);
    const off = AppState.addEventListener('change', (state) => {
      visibility.appState(state === 'active');
      recover();
    });
    return () => {
      live = false;
      offNotice();
      offRetry();
      clearTimeout(retry);
      visibility.blur();
      offHost();
      off.remove();
    };
  }, [path, visibility]);
  return <View ref={mounted} />;
}
