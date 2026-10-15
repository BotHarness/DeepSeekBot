import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_HOST_LOOK, type HostLook } from '../design/host-look';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { t } from '../strings';
import { HostBandLayer, HostChipFace, useHostBand } from './host-band';

export function HomeHeader({
  hostName,
  look = DEFAULT_HOST_LOOK,
  children,
}: {
  hostName: string;
  look?: HostLook;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const band = useHostBand(look.banner);
  return (
    <HostBandLayer
      band={band}
      banner={look.banner}
      header={
        <Pressable
          onPress={() => router.push('/hosts')}
          accessibilityRole="button"
          accessibilityLabel={t.switchComputer(hostName)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x4,
            paddingTop: insets.top + space.x4,
            paddingBottom: space.x5,
            paddingHorizontal: space.x5,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <HostChipFace hostName={hostName} avatar={look.avatar} band={band} />
        </Pressable>
      }
    >
      {focused ? <StatusBar style={band.lightInk ? 'light' : 'dark'} /> : null}
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.base,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </HostBandLayer>
  );
}
