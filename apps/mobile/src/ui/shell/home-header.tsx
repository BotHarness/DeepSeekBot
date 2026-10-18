import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AVATAR_EDGE } from '../chat/conversation-row';
import { DEFAULT_HOST_LOOK, type HostLook } from '../design/host-look';
import { useDesignTheme } from '../design/theme';
import { edgeFade, radius, space } from '../design/tokens';
import { EdgeFade } from '../chat/header-chrome';
import { useMounted } from '../mounted';
import { t } from '../strings';
import { HostBandLayer, HostChipFace, useHostBand } from './host-band';
import { focusOn, hostDrawer, openHostDrawer, useHostDrawerOpen } from './host-drawer';

export function HomeHeader({
  hostName,
  look = DEFAULT_HOST_LOOK,
  actions,
  children,
}: {
  hostName: string;
  look?: HostLook;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const focused = useIsFocused();
  const drawerOpen = useHostDrawerOpen();
  const insets = useSafeAreaInsets();
  const band = useHostBand(look.banner);
  const chip = useMounted<ViewInstance>((node) => {
    hostDrawer.setReturnFocus(() => focusOn(node));
    return () => hostDrawer.setReturnFocus(undefined);
  }, []);
  return (
    <HostBandLayer
      band={band}
      banner={look.banner}
      header={
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingTop: insets.top + space.x4,
            paddingBottom: space.x5,
            paddingLeft: space.x5,
            paddingRight: space.x4,
          }}
        >
          <Pressable
            ref={chip}
            onPress={openHostDrawer}
            accessibilityRole="button"
            accessibilityLabel={t.switchComputer(hostName)}
            accessibilityState={{ expanded: drawerOpen }}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: theme.touch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <HostChipFace hostName={hostName} avatar={look.avatar} band={band} singleLine />
          </Pressable>
          {actions === undefined ? null : (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: space.x2 }}
            >
              {actions}
            </View>
          )}
        </View>
      }
    >
      {focused ? <StatusBar style={band.lightInk ? 'light' : 'dark'} /> : null}
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.base,
          borderTopLeftRadius: radius.md + AVATAR_EDGE,
          borderTopRightRadius: radius.md + AVATAR_EDGE,
          overflow: 'hidden',
        }}
      >
        {children}
        <EdgeFade edge="top" height={edgeFade.top} />
      </View>
    </HostBandLayer>
  );
}
