import { useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { mobileTelemetry } from '../../telemetry/native';
import { StatisticsNoticeView } from './statistics-notice-view';

export function StatisticsNotice() {
  const state = useSyncExternalStore(mobileTelemetry.subscribe, mobileTelemetry.getSnapshot);
  const router = useRouter();
  return (
    <StatisticsNoticeView
      visible={state.noticeOpen}
      onClose={() => {
        void mobileTelemetry.dismissNotice();
      }}
      onSettings={() => {
        void mobileTelemetry.dismissNotice().then(() => router.push('/settings'));
      }}
    />
  );
}
