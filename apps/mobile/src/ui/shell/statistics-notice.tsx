import { useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { mobileTelemetry } from '../../telemetry/native';
import { dismissQueue } from '../chat/message-sheet';
import { StatisticsNoticeView } from './statistics-notice-view';

export function StatisticsNotice() {
  const state = useSyncExternalStore(mobileTelemetry.subscribe, mobileTelemetry.getSnapshot);
  const router = useRouter();
  const queue = useRef(dismissQueue(Platform.OS)).current;
  return (
    <StatisticsNoticeView
      visible={state.noticeOpen}
      onClose={() => {
        void mobileTelemetry.dismissNotice();
      }}
      onSettings={() => {
        void mobileTelemetry
          .dismissNotice()
          .then(() => queue.after(() => router.push('/settings')));
      }}
      onDismissed={queue.flush}
    />
  );
}
