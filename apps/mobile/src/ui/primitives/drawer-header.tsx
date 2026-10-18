import type { ReactNode, Ref } from 'react';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';

import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { CloseIcon } from '../shell/icons';
import { t } from '../strings';
import { DrawerMaterial } from './drawer-material';
import { Text } from './text';

export function DrawerHeader({
  title,
  subtitle,
  icon,
  headingRef,
  onClose,
  closeLabel = t.close,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headingRef?: Ref<ViewInstance>;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const theme = useDesignTheme();
  const capsule = Platform.OS === 'ios';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
      <View style={{ flex: 1, minWidth: 0, gap: space.x3 }}>
        <View
          ref={headingRef}
          accessible
          accessibilityRole="header"
          accessibilityLabel={title}
          style={{
            alignSelf: 'flex-start',
            maxWidth: '100%',
            minHeight: theme.touch,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingHorizontal: capsule ? space.x4 : 0,
            paddingVertical: space.x3,
          }}
        >
          {capsule ? <DrawerMaterial rounded={theme.largeText} /> : null}
          {icon === undefined ? null : <View accessible={false}>{icon}</View>}
          <Text variant="title" style={{ flexShrink: 1 }}>
            {title}
          </Text>
        </View>
        {subtitle === undefined ? null : (
          <Text variant="meta" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {onClose === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={{
            width: theme.touch,
            height: theme.touch,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {({ pressed }) => (
            <>
              <DrawerMaterial />
              {pressed ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    borderRadius: radius.round,
                    backgroundColor: theme.layer.raised.pressed,
                  }}
                />
              ) : null}
              <CloseIcon color={theme.color.fg} size={theme.type.title.line} />
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
