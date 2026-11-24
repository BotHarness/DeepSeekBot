import {
  Box,
  CircularProgressIndicator,
  Host,
  Icon,
  ListItem,
  RNHostView,
  Row,
  Switch,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  background,
  clickable,
  clip,
  Shapes,
  size,
  toggleable,
} from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';

import { settingsColors } from '../design/controls';
import { useDesignTheme } from '../design/theme';
import { loadingIndicator, space } from '../design/tokens';
import { ROW_ICON_SOURCES } from './row-icon-source.android';
import {
  settingsRowLabel,
  valueBelowTitle,
  type SettingsRowControl,
  type SettingsRowProps,
} from './settings-row-model';

const ICON = space.x6;

function TrailingControl({ control }: { control: SettingsRowControl }) {
  const theme = useDesignTheme();
  switch (control.kind) {
    case 'switch':
      return <Switch value={control.value} enabled={control.disabled !== true} />;
    case 'check':
      return <Icon source={ROW_ICON_SOURCES.check} tint={theme.color.accent} size={ICON} />;
    case 'value':
      return (
        <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: space.x2 }}>
          <Text style={{ typography: 'bodyMedium' }} maxLines={1} overflow="ellipsis">
            {control.text}
          </Text>
          {control.chevron === true ? <Icon source={ROW_ICON_SOURCES.chevron} size={ICON} /> : null}
        </Row>
      );
    case 'busy':
      return (
        <CircularProgressIndicator
          color={theme.color.accent}
          strokeWidth={loadingIndicator.controlStroke}
          strokeCap="round"
          modifiers={[size(loadingIndicator.control, loadingIndicator.control)]}
        />
      );
    case 'chevron':
      return <Icon source={ROW_ICON_SOURCES.chevron} size={ICON} />;
    case 'add':
      return <Icon source={ROW_ICON_SOURCES.add} size={ICON} />;
  }
}

export function SettingsListItem(props: SettingsRowProps) {
  const {
    title,
    detail,
    detailDot,
    singleLine = false,
    tone = 'fg',
    strong = false,
    icon,
    iconTone,
    leading,
    trailing,
    accessory,
    selected,
    expanded,
    disclosure = false,
    testID,
    on = 'sheet',
    onPress,
  } = props;
  const theme = useDesignTheme();
  const oneLine = singleLine && !theme.largeText;
  const colors = settingsColors(theme, on);
  const fill = selected === true ? colors.selected : theme.layer[on].fill;
  const control: SettingsRowControl | undefined =
    props.control ?? (disclosure && trailing === undefined ? { kind: 'chevron' } : undefined);
  const below = valueBelowTitle(control, theme.fontScale > 1) ? control : undefined;
  const end: SettingsRowControl | undefined =
    below === undefined ? control : below.chevron === true ? { kind: 'chevron' } : undefined;
  const toggle = control?.kind === 'switch' ? control : undefined;
  const activate = toggle === undefined ? onPress : () => toggle.onChange(!toggle.value);
  const enabled = toggle === undefined ? onPress !== undefined : toggle.disabled !== true;
  const headline =
    selected === true ? colors.selectedText : tone === 'fg' ? undefined : theme.color[tone];
  const lines = oneLine ? { maxLines: 1, overflow: 'ellipsis' as const } : {};
  const detailLine =
    detail === undefined ? null : detailDot === undefined ? (
      <Text {...lines}>{detail}</Text>
    ) : (
      <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: space.x3 }}>
        <Box modifiers={[size(space.x3, space.x3), clip(Shapes.Circle), background(detailDot)]} />
        <Text {...lines}>{detail}</Text>
      </Row>
    );
  const standalone = trailing === undefined && accessory === undefined;
  const item = (
    <View
      testID={testID}
      accessible
      accessibilityRole={
        toggle !== undefined ? 'switch' : onPress === undefined ? 'text' : 'button'
      }
      accessibilityLabel={settingsRowLabel(props)}
      accessibilityState={
        toggle === undefined
          ? {
              selected: selected ?? (control?.kind === 'check' ? true : undefined),
              expanded,
              busy: control?.kind === 'busy' ? true : undefined,
            }
          : { checked: toggle.value, disabled: !enabled }
      }
      accessibilityActions={enabled ? [{ name: 'activate' }] : []}
      onAccessibilityAction={({ nativeEvent }) => {
        if (enabled && nativeEvent.actionName === 'activate') activate?.();
      }}
      style={standalone ? undefined : { flex: 1 }}
    >
      <View importantForAccessibility="no-hide-descendants">
        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
        >
          <ListItem
            colors={{ containerColor: fill }}
            modifiers={
              toggle !== undefined
                ? [toggleable(toggle.value, activate!, { role: 'switch', enabled })]
                : onPress === undefined
                  ? []
                  : [clickable(onPress)]
            }
          >
            <ListItem.HeadlineContent>
              <Text
                {...(headline === undefined ? {} : { color: headline })}
                {...(below === undefined ? lines : {})}
                style={strong ? { fontWeight: 'bold' } : {}}
              >
                {title}
                {below === undefined ? null : (
                  <Text color={theme.color.muted} style={{ fontWeight: 'normal' }}>
                    {`\n${below.text}`}
                  </Text>
                )}
              </Text>
            </ListItem.HeadlineContent>
            {detailLine === null ? null : (
              <ListItem.SupportingContent>{detailLine}</ListItem.SupportingContent>
            )}
            {icon === undefined && leading === undefined ? null : (
              <ListItem.LeadingContent>
                {icon === undefined ? (
                  <RNHostView matchContents>
                    <View>{leading}</View>
                  </RNHostView>
                ) : (
                  <Icon
                    source={ROW_ICON_SOURCES[icon]}
                    size={ICON}
                    {...(iconTone === undefined ? {} : { tint: theme.color[iconTone] })}
                  />
                )}
              </ListItem.LeadingContent>
            )}
            {end === undefined ? null : (
              <ListItem.TrailingContent>
                <TrailingControl control={end} />
              </ListItem.TrailingContent>
            )}
          </ListItem>
        </Host>
      </View>
    </View>
  );
  if (standalone) return item;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingRight: space.x4,
        backgroundColor: fill,
      }}
    >
      {item}
      {trailing}
      {accessory}
    </View>
  );
}
