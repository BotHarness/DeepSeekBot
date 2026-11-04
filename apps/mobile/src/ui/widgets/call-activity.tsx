import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { CallActivityProps } from '../chat/call-activity';

function CallActivity(props: CallActivityProps, environment: LiveActivityEnvironment) {
  'widget';
  const zh = props.locale === 'zh';
  const stale = environment.isStale === true;
  const status = stale
    ? zh
      ? '打开 App 查看通话'
      : 'Open the app to see the call'
    : props.phase === 'connecting'
      ? zh
        ? '正在接通…'
        : 'Connecting…'
      : props.phase === 'hearing'
        ? zh
          ? '正在听你说'
          : 'Hearing you'
        : props.phase === 'thinking'
          ? zh
            ? '正在发送你说的话'
            : 'Sending what you said'
          : props.phase === 'speaking'
            ? zh
              ? '正在说'
              : 'Speaking'
            : props.phase === 'interrupted'
              ? zh
                ? '已被打断'
                : 'Paused by another call'
              : props.phase === 'reconnecting'
                ? zh
                  ? '正在重新连接电脑…'
                  : 'Reconnecting…'
                : props.phase === 'muted'
                  ? zh
                    ? '已静音'
                    : 'Muted'
                  : zh
                    ? '在听'
                    : 'Listening';
  const timer = (
    <Text
      date={new Date(props.startedAt)}
      dateStyle="timer"
      modifiers={[
        monospacedDigit(),
        font({ textStyle: 'headline' }),
        multilineTextAlignment('trailing'),
        frame({ width: 72, alignment: 'trailing' }),
      ]}
    />
  );
  const name = (
    <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(1)]}>{props.name}</Text>
  );
  const controls = (
    <HStack spacing={12}>
      <Button
        target="call-mute"
        label={props.muted ? (zh ? '取消静音' : 'Unmute') : zh ? '静音' : 'Mute'}
        systemImage={props.muted ? 'mic.slash.fill' : 'mic.fill'}
      />
      <Button
        target="call-hang-up"
        role="destructive"
        label={zh ? '挂断' : 'Hang Up'}
        systemImage="phone.down.fill"
      />
    </HStack>
  );
  const banner = (
    <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 })]}>
      <HStack>
        <Image systemName="phone.fill" color="green" />
        {name}
        <Spacer />
        {timer}
      </HStack>
      <HStack>
        <Text modifiers={[foregroundStyle('secondary'), lineLimit(1)]}>{status}</Text>
        <Spacer />
        {controls}
      </HStack>
    </VStack>
  );
  return {
    banner,
    bannerSmall: banner,
    compactLeading: <Image systemName="phone.fill" color="green" />,
    compactTrailing: (
      <Text
        date={new Date(props.startedAt)}
        dateStyle="timer"
        modifiers={[
          monospacedDigit(),
          multilineTextAlignment('trailing'),
          frame({ width: 56, alignment: 'trailing' }),
        ]}
      />
    ),
    minimal: <Image systemName="phone.fill" color="green" />,
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 8 })]}>
        <Image systemName="phone.fill" color="green" />
        {name}
      </HStack>
    ),
    expandedTrailing: <HStack modifiers={[padding({ trailing: 8 })]}>{timer}</HStack>,
    expandedBottom: (
      <HStack>
        <Text modifiers={[foregroundStyle('secondary'), lineLimit(1)]}>{status}</Text>
        <Spacer />
        {controls}
      </HStack>
    ),
  };
}

export const callActivity = createLiveActivity('TobsCall', CallActivity);
