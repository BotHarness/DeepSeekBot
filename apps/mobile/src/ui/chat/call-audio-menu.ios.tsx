import { Host, Image, Menu, Section, Text, Toggle } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  accessibilityValue,
  background,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  menuOrder,
  opacity,
  shapes,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { CallAudioMenuProps } from './call-audio-menu';
import { callAudioDeviceName, callAudioDeviceSymbol } from './call-audio-symbol';

export function CallAudioMenu({
  route,
  size,
  fill,
  ink,
  disabled,
  onOutput,
  onMicrophone,
}: CallAudioMenuProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const output = route.outputs.find((device) => device.id === route.output);
  const microphone = route.microphones.find((device) => device.id === route.microphone);
  const guided = route.microphones.some((device) => device.id === 'headset');
  return (
    <Host key={theme.scheme} colorScheme={theme.scheme} style={{ width: size, height: size }}>
      <Menu
        modifiers={[
          buttonStyle('plain'),
          menuOrder('fixed'),
          accessibilityLabel(t.call.audio),
          accessibilityValue(
            `${callAudioDeviceName(t, output)}, ${t.call.audioMicrophone} ${callAudioDeviceName(t, microphone)}`,
          ),
          accessibilityIdentifier('call-audio'),
          disabledModifier(disabled),
          opacity(disabled ? 0.4 : 1),
        ]}
        label={
          <Image
            systemName={callAudioDeviceSymbol(output)}
            modifiers={[
              font({ textStyle: 'title2' }),
              foregroundStyle(ink),
              frame({ width: size, height: size }),
              background(fill, shapes.circle()),
              contentShape(shapes.circle()),
            ]}
          />
        }
      >
        <Section title={t.call.audioMicrophone}>
          {route.microphones.map((device) => (
            <Toggle
              key={device.id}
              isOn={device.id === route.microphone}
              systemImage={callAudioDeviceSymbol(device)}
              onIsOnChange={() => {
                if (device.id !== route.microphone) onMicrophone(device.id);
              }}
            >
              <Text>{callAudioDeviceName(t, device)}</Text>
              {guided ? <Text>{t.call.audioMicrophoneHint[device.id]}</Text> : null}
            </Toggle>
          ))}
        </Section>
        <Section title={t.call.audioOutput}>
          {route.outputs.map((device) => (
            <Toggle
              key={device.id}
              isOn={device.id === route.output}
              systemImage={callAudioDeviceSymbol(device)}
              onIsOnChange={() => {
                if (device.id !== route.output) onOutput(device.id);
              }}
            >
              <Text>{callAudioDeviceName(t, device)}</Text>
            </Toggle>
          ))}
        </Section>
      </Menu>
    </Host>
  );
}
