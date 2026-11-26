import { SectionList, View } from 'react-native';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { Chip } from '../primitives/chip';
import { HeaderButton } from '../primitives/drawer-header';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { RefreshIcon } from '../shell/icons';
import { ModelBrandIcon } from './model-brand-icon';
import { ModelPickerFilters } from './model-picker-filters';
import { ModelFilterStrip, SessionModelSkeletonRows } from './session-model-filter-strip';
import {
  NativeSessionModelSheet,
  type SessionModelSheetProps,
  type SessionModelSheetRow,
} from './session-model-native';
import { SHEET_GROUP, Sheet, SheetCallout, SheetFailed, SheetHeading, SheetNote } from './sheet';

type SheetSection = SessionModelSheetProps['sections'][number];

type ModelPickerSheetProps = SessionModelSheetProps & {
  subLabel: string;
  alert?: string | undefined;
};

export function ModelPickerSheet(props: ModelPickerSheetProps) {
  if (NativeSessionModelSheet !== undefined)
    return <NativeSessionModelSheet {...props} note={props.alert ?? props.note} />;
  return <FallbackModelPickerSheet {...props} />;
}

function FallbackModelPickerSheet({
  visible,
  title,
  note,
  failure,
  sections,
  skeleton,
  filters,
  filter,
  filterLabel,
  current,
  saving,
  savingLabel,
  loading,
  refreshLabel,
  refreshingLabel,
  refreshing,
  onClose,
  onRetry,
  onRefresh,
  onFilter,
  onChoose,
  selected,
  confirm,
  effort,
  subLabel,
  alert,
}: ModelPickerSheetProps) {
  const theme = useDesignTheme();
  const checked = (key: string) =>
    selected === undefined ? current === key : selected.includes(key);
  const ids = sections.map((section) => section.id);
  const stripAfter = ids.includes('presets')
    ? 'presets'
    : ids.includes('default')
      ? 'default'
      : undefined;
  return (
    <Sheet
      visible={visible}
      label={title}
      title={title}
      onClose={onClose}
      resizable
      trailing={
        refreshing ? (
          <View style={{ width: theme.touch, height: theme.touch, justifyContent: 'center' }}>
            <LoadingIndicator accessibilityLabel={refreshingLabel} />
          </View>
        ) : (
          <HeaderButton label={refreshLabel} testID="session-model-refresh" onPress={onRefresh}>
            <RefreshIcon color={theme.color.fg} size={theme.type.title.line} />
          </HeaderButton>
        )
      }
    >
      {failure !== undefined ? (
        <SheetFailed message={failure} on={SHEET_GROUP} onRetry={onRetry} />
      ) : loading ? (
        <SessionModelSkeletonRows skeleton={skeleton} label={refreshingLabel} />
      ) : (
        <>
          {alert === undefined ? null : <SheetCallout tone="danger">{alert}</SheetCallout>}
          {note === undefined ? null : <SheetNote>{note}</SheetNote>}
          {effort === undefined || effort.options.length === 0 ? null : (
            <View>
              <SheetHeading>{effort.title}</SheetHeading>
              <ModelPickerFilters>
                {effort.options.map((option) => (
                  <Chip
                    key={option.id || 'default'}
                    testID={`model-effort-${option.id || 'default'}`}
                    label={option.label}
                    selected={option.id === effort.current}
                    onPress={() => effort.onChoose(option.id)}
                  />
                ))}
              </ModelPickerFilters>
            </View>
          )}
          <SectionList<SessionModelSheetRow, SheetSection>
            nestedScrollEnabled
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: space.x5 }}
            sections={sections}
            keyExtractor={(row) => row.key}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) =>
              section.title && section.data.length > 0 ? (
                <SheetHeading>{section.title}</SheetHeading>
              ) : null
            }
            ListHeaderComponent={
              stripAfter === undefined && filters.length > 0 ? (
                <ModelFilterStrip
                  filters={filters}
                  active={filter}
                  label={filterLabel}
                  sub={subLabel}
                  onFilter={onFilter}
                />
              ) : undefined
            }
            renderSectionFooter={({ section }) =>
              section.id === stripAfter && filters.length > 0 ? (
                <ModelFilterStrip
                  filters={filters}
                  active={filter}
                  label={filterLabel}
                  sub={subLabel}
                  onFilter={onFilter}
                />
              ) : null
            }
            renderItem={({ item, index, section }) => (
              <SettingsGroupItem
                first={index === 0}
                last={index === section.data.length - 1}
                on={SHEET_GROUP}
              >
                <SettingsRow
                  on={SHEET_GROUP}
                  testID={item.testID ?? `model-sheet-option-${section.id}-${index}`}
                  title={item.name}
                  detail={saving === item.key ? savingLabel : item.detail}
                  selected={checked(item.key)}
                  accessibilityLabel={item.accessible}
                  control={
                    saving === item.key
                      ? { kind: 'busy' }
                      : checked(item.key)
                        ? { kind: 'check' }
                        : undefined
                  }
                  leading={
                    <ModelBrandIcon
                      brand={item.brand}
                      size={theme.type.title.line * theme.fontScale}
                      color={theme.color.muted}
                    />
                  }
                  trailing={
                    item.tag === undefined ? undefined : (
                      <Text variant="meta" tone="muted">
                        {item.tag}
                      </Text>
                    )
                  }
                  {...(item.disabled || saving !== undefined
                    ? { tone: 'muted' }
                    : { onPress: () => onChoose(item.key) })}
                />
              </SettingsGroupItem>
            )}
          />
          {confirm === undefined ? null : (
            <View style={{ paddingHorizontal: space.x5, paddingVertical: space.x3 }}>
              <Button
                testID="model-sheet-confirm"
                label={confirm.label}
                disabled={confirm.disabled || saving !== undefined}
                onPress={confirm.onPress}
              />
            </View>
          )}
        </>
      )}
    </Sheet>
  );
}
