import { Text, VStack, HStack } from '@expo/ui/swift-ui';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { ActivityDisplay } from '../../host/live-activity-session';

function RequestActivity(props: ActivityDisplay, environment: LiveActivityEnvironment) {
  'widget';
  const zh = props.locale === 'zh';
  const unknown = environment.isStale || props.state === 'unknown';
  const status = unknown
    ? zh
      ? '打开 App 查看进展'
      : 'Open app for progress'
    : props.state === 'completed'
      ? zh
        ? '已完成'
        : 'Completed'
      : props.state === 'failed'
        ? zh
          ? '需要查看'
          : 'Needs attention'
        : zh
          ? '正在处理'
          : 'Working';
  const source = props.source;
  const banner = (
    <VStack alignment="leading">
      <Text>{status}</Text>
      <Text>{source}</Text>
      <HStack>
        <Text>{zh ? '更新于' : 'Updated'}</Text>
        <Text date={new Date(props.updatedAt)} dateStyle="time" />
      </HStack>
    </VStack>
  );
  return {
    banner,
    bannerSmall: banner,
    compactLeading: <Text>Tobs</Text>,
    compactTrailing: <Text>{unknown ? '…' : props.state === 'completed' ? '✓' : '·'}</Text>,
    minimal: <Text>{unknown ? '…' : props.state === 'completed' ? '✓' : '·'}</Text>,
    expandedCenter: banner,
  };
}

export const requestActivity = createLiveActivity('TobsRequest', RequestActivity);
