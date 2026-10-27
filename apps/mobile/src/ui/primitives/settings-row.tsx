import { Children, isValidElement, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import type { LayerName } from '../design/layers';
import { settingsColors } from '../design/controls';
import { androidSettings, edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { ChevronRightIcon, PlusIcon } from '../shell/icons';
import { LoadingIndicator } from './loading-indicator';
import { RowIcon } from './row-icon';
import { SettingsListItem } from './settings-list-item';
import type { SettingsRowControl, SettingsRowProps } from './settings-row-model';
export type { SettingsRowControl, SettingsRowProps } from './settings-row-model';
import { SystemSymbol } from './system-symbol';
import { Text } from './text';
import { Toggle } from './toggle';
import { segmentCorners } from '../design/segment-corners';
import { useSettingsFormPlace } from './settings-form-context';
import { FormRow, FormSection } from './settings-form-row';

function ControlView({
  control,
  label,
  on,
}: {
  control: SettingsRowControl;
  label: string;
  on: LayerName;
}) {
  const theme = useDesignTheme();
  switch (control.kind) {
    case 'switch':
      return (
        <Toggle
          {...(control.testID === undefined ? {} : { testID: control.testID })}
          on={on}
          label={label}
          value={control.value}
          disabled={control.disabled === true}
          onChange={control.onChange}
        />
      );
    case 'check':
      return (
        <SystemSymbol
          name={{ ios: 'checkmark', android: 'check' }}
          size={theme.type.title.line}
          color={theme.color.accent}
        />
      );
    case 'value':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          <Text tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {control.text}
          </Text>
          {control.chevron === true ? (
            <ChevronRightIcon color={theme.color.muted} size={theme.type.body.line} />
          ) : null}
        </View>
      );
    case 'busy':
      return <LoadingIndicator size="control" />;
    case 'chevron':
      return <ChevronRightIcon color={theme.color.muted} size={theme.type.body.line} />;
    case 'add':
      return <PlusIcon color={theme.color.muted} size={theme.type.title.line} />;
  }
}

export function SettingsRow(props: SettingsRowProps) {
  if (Platform.OS === 'android') return <SettingsListItem {...props} />;
  return <SettingsRowByPlace {...props} />;
}

function SettingsRowByPlace(props: SettingsRowProps) {
  if (useSettingsFormPlace() !== false) return <FormRow {...props} />;
  return <ReactNativeSettingsRow {...props} />;
}

function ReactNativeSettingsRow({
  title,
  detail,
  tone = 'fg',
  strong = false,
  icon,
  iconTone,
  leading,
  control,
  trailing,
  accessory,
  selected,
  expanded,
  accessibilityLabel,
  testID,
  on = 'sheet',
  onPress,
}: SettingsRowProps) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  const row = (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={onPress === undefined}
      accessible={onPress === undefined ? false : undefined}
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
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: pressed ? layer.pressed : layer.fill,
      })}
    >
      {icon === undefined ? null : (
        <RowIcon
          name={icon}
          {...(iconTone === undefined ? {} : { color: theme.color[iconTone] })}
        />
      )}
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
        <Text variant="body" tone={tone} strong={strong}>
          {title}
        </Text>
        {detail === undefined ? null : (
          <Text variant="meta" tone="muted">
            {detail}
          </Text>
        )}
      </View>
      {trailing ??
        (control === undefined ? null : (
          <ControlView control={control} label={accessibilityLabel ?? title} on={on} />
        ))}
    </Pressable>
  );
  if (accessory === undefined) return row;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: space.x3,
        backgroundColor: layer.fill,
      }}
    >
      {row}
      {accessory}
    </View>
  );
}

type SettingsSectionProps = {
  title?: string;
  footer?: string | undefined;
  on?: LayerName;
  children: ReactNode;
};

export function SettingsSection(props: SettingsSectionProps) {
  if (useSettingsFormPlace() !== false) return <FormSection {...props} />;
  return <SettingsSectionView {...props} />;
}

function SettingsSectionView({ title, footer, on = 'sheet', children }: SettingsSectionProps) {
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
