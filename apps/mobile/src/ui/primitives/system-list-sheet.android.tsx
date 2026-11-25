import {
  CircularProgressIndicator,
  Host,
  Icon,
  LazyColumn,
  ListItem,
  ModalBottomSheet,
  RNHostView,
  Row,
  Switch,
  Text,
  TextButton,
} from '@expo/ui/jetpack-compose';
import {
  clickable,
  fillMaxWidth,
  padding,
  semantics,
  size,
  testID as testTag,
  toggleable,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { StyleSheet, View } from 'react-native';

import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { loadingIndicator, space } from '../design/tokens';
import { ROW_ICON_SOURCES } from './row-icon-source.android';
import type { SystemListRow, SystemListSheetProps } from './system-list-sheet';

const ICON = space.x6;
const CLEAR = '#00000000';

export function SystemListSheet({
  visible,
  title,
  sections,
  confirm,
  onClose,
}: SystemListSheetProps) {
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  if (!visible) return null;
  const busy = (
    <CircularProgressIndicator
      color={roles.primary}
      strokeWidth={loadingIndicator.controlStroke}
      strokeCap="round"
      modifiers={[size(loadingIndicator.control, loadingIndicator.control)]}
    />
  );
  const row = (item: SystemListRow) => {
    if (item.kind === 'note')
      return (
        <Text
          key={item.key}
          color={
            item.tone === 'danger'
              ? roles.error
              : item.tone === 'label'
                ? roles.onSurface
                : roles.onSurfaceVariant
          }
          style={{ typography: item.tone === 'label' ? 'bodyLarge' : 'bodyMedium' }}
          modifiers={[padding(space.x6, space.x3, space.x6, space.x3)]}
        >
          {item.text}
        </Text>
      );
    if (item.kind === 'progress')
      return (
        <Row
          key={item.key}
          horizontalArrangement="center"
          modifiers={[
            fillMaxWidth(),
            padding(0, space.x5, 0, space.x5),
            semantics({ contentDescription: item.label }),
          ]}
        >
          {busy}
        </Row>
      );
    if (item.kind === 'toggle')
      return (
        <ListItem
          key={item.key}
          colors={{ containerColor: CLEAR }}
          modifiers={[toggleable(item.value, () => item.onChange(!item.value), { role: 'switch' })]}
        >
          <ListItem.HeadlineContent>
            <Text>{item.label}</Text>
          </ListItem.HeadlineContent>
          <ListItem.TrailingContent>
            <Switch value={item.value} />
          </ListItem.TrailingContent>
        </ListItem>
      );
    if (item.kind === 'action')
      return (
        <ListItem
          key={item.key}
          colors={{ containerColor: CLEAR }}
          modifiers={[clickable(item.onPress), semantics({ contentDescription: item.label })]}
        >
          <ListItem.HeadlineContent>
            <Text color={roles.primary}>{item.label}</Text>
          </ListItem.HeadlineContent>
        </ListItem>
      );
    const off = item.disabled === true;
    const ink =
      off || item.muted === true
        ? roles.onSurfaceVariant
        : item.destructive === true
          ? roles.error
          : roles.onSurface;
    return (
      <ListItem
        key={item.key}
        colors={{ containerColor: CLEAR }}
        modifiers={[
          ...(off ? [] : [clickable(item.onPress)]),
          semantics({ contentDescription: item.accessibilityLabel ?? item.label }),
          ...(item.testID === undefined ? [] : [testTag(item.testID)]),
        ]}
      >
        <ListItem.HeadlineContent>
          <Text color={ink}>{item.label}</Text>
        </ListItem.HeadlineContent>
        {item.detail === undefined ? null : (
          <ListItem.SupportingContent>
            <Text color={roles.onSurfaceVariant}>{item.detail}</Text>
          </ListItem.SupportingContent>
        )}
        {item.leading === undefined ? null : (
          <ListItem.LeadingContent>
            <RNHostView matchContents>
              <View style={{ width: item.leading.size, height: item.leading.size }}>
                {item.leading.node}
              </View>
            </RNHostView>
          </ListItem.LeadingContent>
        )}
        {item.value === undefined &&
        item.busy !== true &&
        item.selected !== true &&
        item.accessory === undefined ? null : (
          <ListItem.TrailingContent>
            <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: space.x2 }}>
              {item.value === undefined ? null : (
                <Text color={roles.onSurfaceVariant} style={{ typography: 'bodyMedium' }}>
                  {item.value}
                </Text>
              )}
              {item.busy === true ? (
                busy
              ) : item.selected === true ? (
                <Icon source={ROW_ICON_SOURCES.check} tint={roles.primary} size={ICON} />
              ) : item.accessory === 'add' ? (
                <Icon source={ROW_ICON_SOURCES.add} tint={roles.primary} size={ICON} />
              ) : item.accessory === 'chevron' ? (
                <Icon source={ROW_ICON_SOURCES.chevron} tint={roles.onSurfaceVariant} size={ICON} />
              ) : null}
            </Row>
          </ListItem.TrailingContent>
        )}
      </ListItem>
    );
  };
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <ModalBottomSheet onDismissRequest={onClose}>
        <LazyColumn contentPadding={{ bottom: space.x6 }}>
          <Row
            verticalAlignment="center"
            modifiers={[fillMaxWidth(), padding(space.x6, 0, space.x4, space.x3)]}
          >
            <Text
              color={roles.onSurface}
              style={{ typography: 'titleLarge' }}
              modifiers={[weight(1)]}
            >
              {title}
            </Text>
            {confirm === undefined ? null : (
              <TextButton
                enabled={confirm.disabled !== true}
                onClick={confirm.onPress}
                modifiers={[semantics({ contentDescription: confirm.label })]}
              >
                <Text>{confirm.label}</Text>
              </TextButton>
            )}
          </Row>
          {sections.flatMap((section) => [
            ...(section.title === undefined
              ? []
              : [
                  <Text
                    key={`${section.key}:title`}
                    color={roles.primary}
                    style={{ typography: 'labelLarge' }}
                    modifiers={[padding(space.x6, space.x5, space.x6, space.x2)]}
                  >
                    {section.title}
                  </Text>,
                ]),
            ...section.rows.map(row),
            ...(section.footer === undefined
              ? []
              : [
                  <Text
                    key={`${section.key}:footer`}
                    color={roles.onSurfaceVariant}
                    style={{ typography: 'bodySmall' }}
                    modifiers={[padding(space.x6, space.x2, space.x6, space.x3)]}
                  >
                    {section.footer}
                  </Text>,
                ]),
          ])}
        </LazyColumn>
      </ModalBottomSheet>
    </Host>
  );
}
