import { Box, Column, DropdownMenu, Host } from '@expo/ui/jetpack-compose';
import { fillMaxSize, width } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { materialMenu, radius } from '../design/tokens';
import { MaterialMenuGroup } from '../primitives/material-menu.android';
import { SystemSymbol } from '../primitives/system-symbol';
import { useStrings } from '../strings';
import type { CallAudioMenuProps } from './call-audio-menu';
import type { CallAudioOutput } from '../../host/call-audio-route';
import { callAudioDeviceName } from './call-audio-symbol';

export function CallAudioMenu({
  route,
  size,
  fill,
  ink,
  disabled,
  onOutput,
  onMicrophone,
  onMode,
}: CallAudioMenuProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  const output = route.outputs.find((device) => device.id === route.output);
  const microphone = route.microphones.find((device) => device.id === route.microphone);
  const symbol = (device: CallAudioOutput | undefined) =>
    ({
      ios: 'speaker.wave.2.fill',
      android:
        device?.id === 'receiver'
          ? 'phone_in_talk'
          : device?.kind === 'bluetooth'
            ? 'bluetooth_audio'
            : device?.id === 'external'
              ? 'headphones'
              : 'volume_up',
    }) as const;
  return (
    <View style={{ width: size, height: size }}>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <DropdownMenu
          expanded={open && !disabled}
          onDismissRequest={() => setOpen(false)}
          color="transparent"
          shadowElevation={0}
        >
          <DropdownMenu.Trigger>
            <Box modifiers={[fillMaxSize()]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            <Column
              modifiers={[width(materialMenu.width)]}
              verticalArrangement={{ spacedBy: materialMenu.groupGap }}
            >
              <MaterialMenuGroup
                items={route.outputs.map((device) => ({
                  key: device.id,
                  label: callAudioDeviceName(t, device),
                  selected: device.id === route.output,
                  testID: `call-audio-output-${device.id}`,
                  icon: (
                    <SystemSymbol name={symbol(device)} color={ink} size={materialMenu.iconSize} />
                  ),
                  onPress: () => {
                    setOpen(false);
                    if (device.id !== route.output) onOutput(device.id);
                  },
                }))}
              />
              <MaterialMenuGroup
                items={route.microphones.map((device) => ({
                  key: device.id,
                  label: `${t.call.audioMicrophone} · ${callAudioDeviceName(t, device)}`,
                  selected: route.microphoneConfirmed !== false && device.id === route.microphone,
                  testID: `call-audio-microphone-${device.id}`,
                  icon: (
                    <SystemSymbol
                      name={{ ios: 'mic.fill', android: 'mic' }}
                      color={ink}
                      size={materialMenu.iconSize}
                    />
                  ),
                  onPress: () => {
                    setOpen(false);
                    onMicrophone(device.id);
                  },
                }))}
              />
              {onMode ? (
                <MaterialMenuGroup
                  items={[false, true].map((music) => ({
                    key: String(music),
                    label: music ? t.call.audioMediaMode : t.call.audioCallMode,
                    selected: route.music === music,
                    testID: `call-audio-mode-${music ? 'media' : 'communication'}`,
                    icon: (
                      <SystemSymbol
                        name={{
                          ios: 'speaker.wave.2.fill',
                          android: music ? 'music_note' : 'call',
                        }}
                        color={ink}
                        size={materialMenu.iconSize}
                      />
                    ),
                    onPress: () => {
                      setOpen(false);
                      if (music !== route.music) onMode(music);
                    },
                  }))}
                />
              ) : null}
            </Column>
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
      <Pressable
        testID="call-audio"
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t.call.audio}
        accessibilityValue={{
          text: `${callAudioDeviceName(t, output)}, ${
            route.microphoneConfirmed === false
              ? t.call.audioMicrophoneInactive
              : `${t.call.audioMicrophone} ${callAudioDeviceName(t, microphone)}`
          }`,
        }}
        accessibilityState={{ expanded: open && !disabled, disabled }}
        android_ripple={{ color: theme.layer.sheet.pressed, borderless: false }}
        style={{
          width: size,
          height: size,
          borderRadius: radius.round,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <SystemSymbol name={symbol(output)} color={ink} size={theme.type.title.size} />
      </Pressable>
    </View>
  );
}
