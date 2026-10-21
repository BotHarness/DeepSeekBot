import { Children, isValidElement, type ReactNode } from 'react';
import { Platform, Pressable, View, type PressableProps } from 'react-native';

import type { LayerName } from '../design/layers';
import type { ColorRole } from '../design/resolve-theme';
import { settingsColors } from '../design/controls';
import { androidSettings, edge, radius, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { ChevronRightIcon } from '../shell/icons';
import { Text } from './text';
import { segmentCorners } from '../design/segment-corners';

function SettingsFrame({
  onPress,
  style,
  children,
  ...props
}: Omit<PressableProps, 'children'> & { children: ReactNode }) {
  if (Platform.OS === 'android' && onPress === undefined)
    return (
      <View style={typeof style === 'function' ? style({ pressed: false }) : style}>
        {children}
      </View>
    );
  return (
    <Pressable {...props} onPress={onPress} style={style}>
      {children}
    </Pressable>
  );
}

export function SettingsRow({
  title,
  detail,
  tone = 'fg',
  strong = false,
  leading,
  trailing,
  accessory,
  selected,
  expanded,
  disclosure = false,
  accessibilityLabel,
  on = 'sheet',
  onPress,
}: {
  title: string;
  detail?: string;
  tone?: ColorRole;
  strong?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  accessory?: ReactNode;
  selected?: boolean;
  expanded?: boolean;
  disclosure?: boolean;
  accessibilityLabel?: string;
  on?: LayerName;
  onPress?: (() => void) | undefined;
}) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  const android = Platform.OS === 'android';
  const colors = settingsColors(theme, on);
  const row = (
    <SettingsFrame
      onPress={onPress}
      disabled={onPress === undefined}
      accessible={android && onPress === undefined ? false : undefined}
      android_ripple={android && onPress ? { color: pressTint(theme.color.fg) } : undefined}
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={
        onPress === undefined
          ? undefined
          : (accessibilityLabel ?? (detail === undefined ? title : `${title}, ${detail}`))
      }
      accessibilityState={
        selected === undefined && expanded === undefined ? undefined : { selected, expanded }
      }
      style={({ pressed }) => ({
        flex: accessory === undefined ? undefined : 1,
        minHeight: android
          ? detail === undefined
            ? androidSettings.rowHeight
            : androidSettings.supportingRowHeight
          : theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        paddingHorizontal: space.x5,
        paddingVertical: android ? androidSettings.vertical : space.x3,
        backgroundColor:
          pressed && !android ? layer.pressed : android && selected ? colors.selected : layer.fill,
      })}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: android ? space.x2 : space.x1 }}>
        <Text
          variant={android ? 'title' : 'body'}
          tone={android && selected ? 'accent' : tone}
          strong={strong}
          style={android && selected ? { color: colors.selectedText } : undefined}
        >
          {title}
        </Text>
        {detail === undefined ? null : (
          <Text variant={android ? 'body' : 'meta'} tone="muted">
            {detail}
          </Text>
        )}
      </View>
      {trailing ??
        (android && disclosure ? (
          <ChevronRightIcon size={space.x6} color={theme.color.muted} />
        ) : null)}
    </SettingsFrame>
  );
  if (accessory === undefined) return row;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: space.x3,
        backgroundColor: android && selected ? colors.selected : layer.fill,
      }}
    >
      {row}
      {accessory}
    </View>
  );
}

export function SettingsSection({
  title,
  footer,
  on = 'sheet',
  children,
}: {
  title?: string;
  footer?: string | undefined;
  on?: LayerName;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const android = Platform.OS === 'android';
  const rows = android ? Children.toArray(children) : [];
  return (
    <View style={{ gap: android ? androidSettings.sectionGap : space.x2 }}>
      {title === undefined ? null : <SettingsHeading>{title}</SettingsHeading>}
      {android ? (
        <View style={{ gap: androidSettings.segmentGap }}>
          {rows.map((child, index) => (
            <View
              key={isValidElement(child) ? child.key : index}
              style={{
                backgroundColor: theme.layer[on].fill,
                overflow: 'hidden',
                ...segmentCorners(index === 0, index === rows.length - 1),
              }}
            >
              {child}
            </View>
          ))}
        </View>
      ) : (
        <View
          style={{
            backgroundColor: theme.layer[on].fill,
            borderRadius: radius.md,
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
      )}
      {footer === undefined ? null : <SettingsFooter>{footer}</SettingsFooter>}
    </View>
  );
}

export function SettingsHeading({ children }: { children: string }) {
  const android = Platform.OS === 'android';
  const theme = useDesignTheme();
  return (
    <Text
      variant={android ? 'body' : 'meta'}
      tone={android ? 'accent' : 'muted'}
      strong={android}
      accessibilityRole="header"
      style={{
        paddingHorizontal: space.x5,
        ...(android ? { color: settingsColors(theme, 'sheet').heading } : {}),
      }}
    >
      {children}
    </Text>
  );
}

export function SettingsFooter({ children }: { children: string }) {
  return (
    <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
      {children}
    </Text>
  );
}

export function SettingsGroupItem({
  first,
  last,
  on = 'sheet',
  children,
}: {
  first: boolean;
  last: boolean;
  on?: LayerName;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  const android = Platform.OS === 'android';
  if (android)
    return (
      <View
        style={{
          marginHorizontal: space.x5,
          marginTop: first ? 0 : androidSettings.segmentGap,
          backgroundColor: layer.fill,
          overflow: 'hidden',
          ...segmentCorners(first, last),
        }}
      >
        {children}
      </View>
    );
  return (
    <View
      style={{
        marginHorizontal: space.x5,
        backgroundColor: layer.fill,
        borderTopLeftRadius: first ? radius.md : 0,
        borderTopRightRadius: first ? radius.md : 0,
        borderBottomLeftRadius: last ? radius.md : 0,
        borderBottomRightRadius: last ? radius.md : 0,
        borderTopWidth: first ? 0 : edge.hairline,
        borderTopColor: layer.divider,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}
