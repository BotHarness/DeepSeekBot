import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { pressTint, useDesignTheme } from '../design/theme';
import { fab, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import {
  ChatsIcon,
  ChevronLeftIcon,
  CloseIcon,
  CloudIcon,
  ComputerIcon,
  PersonIcon,
  ShareIcon,
} from './icons';
import { t } from '../strings';
import { creationLabel, useCreationMenu, type CreationPanelProps } from './creation-menu';

export function CreationPanel({
  scope,
  targets,
  bottom,
  onClose,
  onPick,
  busy,
  error,
}: CreationPanelProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { choosing, setChoosing, actions, choices, pick } = useCreationMenu({
    scope,
    targets,
    onPick,
  });
  const ink = theme.color.fg;
  const icon = theme.type.title.line;
  const notice = choosing
    ? choices.length === 0
      ? t.noCreationTargets
      : t.chooseCreationTarget
    : actions.length === 0
      ? t.noCreationTargets
      : undefined;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom,
            left: insets.left + fab.margin,
            right: insets.right + fab.margin,
            alignItems: 'flex-end',
            gap: fab.menuCloseGap,
          }}
        >
          <ScrollView
            style={{ alignSelf: 'stretch', maxHeight: height - bottom - fab.size - insets.top }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'flex-end',
              alignItems: 'flex-end',
              gap: fab.menuItemGap,
            }}
          >
            {notice === undefined && !error ? null : (
              <View
                style={{
                  maxWidth: '100%',
                  borderRadius: radius.lg,
                  paddingHorizontal: space.x5,
                  paddingVertical: space.x4,
                  gap: space.x2,
                  marginBottom: space.x2,
                  backgroundColor: theme.overlay.fill,
                }}
              >
                {notice === undefined ? null : <Text strong>{notice}</Text>}
                {error ? <Text accessibilityRole="alert">{error}</Text> : null}
              </View>
            )}
            {choosing ? (
              <>
                {choices.map((target) => {
                  const Icon = target.kind === 'computer' ? ComputerIcon : CloudIcon;
                  return (
                    <FabMenuItem
                      key={target.key}
                      label={target.name}
                      disabled={busy}
                      icon={<Icon color={ink} size={icon} />}
                      onPress={() => onPick(choosing, target)}
                    />
                  );
                })}
                <FabMenuItem
                  label={t.back}
                  disabled={busy}
                  icon={<ChevronLeftIcon color={ink} size={icon} />}
                  onPress={() => setChoosing(undefined)}
                />
              </>
            ) : (
              actions.map((action) => {
                const Icon =
                  action === 'channel' ? ChatsIcon : action === 'bot' ? PersonIcon : ShareIcon;
                return (
                  <FabMenuItem
                    key={action}
                    label={creationLabel(action)}
                    disabled={busy}
                    icon={<Icon color={ink} size={icon} />}
                    onPress={() => pick(action)}
                  />
                );
              })
            )}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.close}
            onPress={onClose}
            android_ripple={{ color: pressTint(theme.color.onAccent) }}
            style={{
              width: fab.size,
              height: fab.size,
              borderRadius: radius.round,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.color.accent,
              elevation: fab.elevation,
            }}
          >
            <CloseIcon color={theme.color.onAccent} size={icon} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FabMenuItem({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={{
        maxWidth: '100%',
        minHeight: fab.menuItemHeight,
        flexDirection: 'row',
        alignItems: 'center',
        gap: fab.menuIconGap,
        paddingHorizontal: fab.menuItemPadding,
        paddingVertical: space.x3,
        borderRadius: radius.round,
        overflow: 'hidden',
        backgroundColor: theme.layer.canvas.chosen,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {icon}
      </View>
      <Text strong style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}
