import type { ReactNode, Ref } from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { BackIcon } from '../shell/back-icon';
import { CheckIcon, CloseIcon } from '../shell/icons';
import { t } from '../strings';
import { Text } from './text';

function HeaderButton({
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
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      {children}
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
  onBack,
  onConfirm,
  confirmLabel = t.done,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headingRef?: Ref<ViewInstance>;
  onClose?: () => void;
  closeLabel?: string;
  onBack?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
}) {
  const theme = useDesignTheme();
  const slot = { width: theme.touch, minHeight: theme.touch };
  return (
    <View style={{ gap: space.x3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
        <View style={slot}>
          {onBack !== undefined ? (
            <HeaderButton label={t.back} onPress={onBack}>
              <BackIcon color={theme.color.fg} size={theme.type.title.line} />
            </HeaderButton>
          ) : onClose !== undefined ? (
            <HeaderButton label={closeLabel} onPress={onClose}>
              <CloseIcon color={theme.color.fg} size={theme.type.title.line} />
            </HeaderButton>
          ) : null}
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
              paddingVertical: space.x3,
            }}
          >
            {icon === undefined ? null : <View accessible={false}>{icon}</View>}
            <Text variant="title" strong style={{ flexShrink: 1, textAlign: 'center' }}>
              {title}
            </Text>
          </View>
        </View>
        <View style={slot}>
          {onConfirm === undefined ? null : (
            <HeaderButton label={confirmLabel} onPress={onConfirm}>
              <CheckIcon color={theme.color.fg} size={theme.type.title.line} />
            </HeaderButton>
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
