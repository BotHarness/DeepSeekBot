import type { ReactNode, Ref } from 'react';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';

import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { CheckIcon, CloseIcon } from '../shell/icons';
import { t } from '../strings';
import { DrawerMaterial } from './drawer-material';
import { Text } from './text';

function GlassButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
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
          {children}
        </>
      )}
    </Pressable>
  );
}

export function DrawerHeader({
  title,
  subtitle,
  icon,
  headingRef,
  onClose,
  closeLabel = t.close,
  onConfirm,
  confirmLabel = t.done,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headingRef?: Ref<ViewInstance>;
  onClose?: () => void;
  closeLabel?: string;
  onConfirm?: () => void;
  confirmLabel?: string;
}) {
  const theme = useDesignTheme();
  const capsule = Platform.OS === 'ios';
  const slot = { width: theme.touch, minHeight: theme.touch };
  return (
    <View style={{ gap: space.x3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
        <View style={slot}>
          {onClose === undefined ? null : (
            <GlassButton label={closeLabel} onPress={onClose}>
              <CloseIcon color={theme.color.fg} size={theme.type.title.line} />
            </GlassButton>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <View
            ref={headingRef}
            accessible
            accessibilityRole="header"
            accessibilityLabel={title}
            style={{
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
            <Text variant="title" style={{ flexShrink: 1, textAlign: 'center' }}>
              {title}
            </Text>
          </View>
        </View>
        <View style={slot}>
          {onConfirm === undefined ? null : (
            <GlassButton label={confirmLabel} onPress={onConfirm}>
              <CheckIcon color={theme.color.fg} size={theme.type.title.line} />
            </GlassButton>
          )}
        </View>
      </View>
      {subtitle === undefined ? null : (
        <Text variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
