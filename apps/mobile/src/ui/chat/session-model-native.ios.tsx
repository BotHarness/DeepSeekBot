import {
  BottomSheet,
  Button,
  Group,
  HStack,
  Host,
  Image,
  List,
  NavigationStack,
  Picker,
  ProgressView,
  RNHostView,
  ScrollView,
  Section,
  Spacer,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHidden,
  accessibilityLabel,
  accessibilityValue,
  buttonBorderShape,
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  listStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  padding,
  pickerStyle,
  presentationDetents,
  presentationDragIndicator,
  redacted,
  scrollContentBackground,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Platform, PlatformColor, View } from 'react-native';

import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { ModelBrandIcon } from './model-brand-icon';
import { FILTER_SKELETON_CHIPS, ModelFilterGlyph } from './session-model-filter-strip';
import type { SessionModelSheetProps } from './session-model-native';

function RowContent({
  name,
  brand,
  detail,
  tag,
  dim,
  trailing,
}: {
  name: string;
  brand: ModelBrand | undefined;
  detail: string | undefined;
  tag: string | undefined;
  dim: boolean;
  trailing: 'check' | 'saving' | 'none';
}) {
  const theme = useDesignTheme();
  const icon = theme.type.title.line;
  return (
    <HStack spacing={12}>
      <RNHostView matchContents>
        <View style={{ width: icon, height: icon }}>
          <ModelBrandIcon brand={brand} size={icon} color={theme.color.muted} />
        </View>
      </RNHostView>
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[foregroundStyle(PlatformColor(dim ? 'tertiaryLabel' : 'label'))]}>
          {name}
        </Text>
        {detail === undefined ? null : (
          <Text
            modifiers={[
              font({ textStyle: 'footnote' }),
              foregroundStyle(PlatformColor('secondaryLabel')),
            ]}
          >
            {detail}
          </Text>
        )}
      </VStack>
      <Spacer />
      {tag === undefined ? null : (
        <Text
          modifiers={[
            font({ textStyle: 'footnote' }),
            foregroundStyle(PlatformColor('secondaryLabel')),
          ]}
        >
          {tag}
        </Text>
      )}
      {trailing === 'saving' ? (
        <ProgressView />
      ) : trailing === 'check' ? (
        <Image
          systemName="checkmark"
          modifiers={[font({ textStyle: 'body', weight: 'semibold' })]}
          color={theme.color.accent}
        />
      ) : (
        <Spacer modifiers={[frame({ width: 0 })]} />
      )}
    </HStack>
  );
}

function FilterStrip({
  label,
  chips,
}: {
  label: string;
  chips: {
    key: string;
    brand: ModelBrand | undefined;
    sub: boolean;
    picked: boolean;
    accessible?: string;
    onPress?: () => void;
  }[];
}) {
  const theme = useDesignTheme();
  const glass = Number(Platform.Version) >= 26;
  const size = theme.touch - space.x4;
  const placeholder = chips.every((chip) => chip.onPress === undefined);
  return (
    <ScrollView
      axes="horizontal"
      showsIndicators={false}
      modifiers={[
        listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
        listRowBackground('transparent'),
        listRowSeparator('hidden'),
        ...(placeholder
          ? [redacted('placeholder'), accessibilityHidden(true)]
          : [accessibilityElement('contain'), accessibilityLabel(label)]),
      ]}
    >
      <HStack spacing={space.x3} modifiers={[padding({ horizontal: space.x5 })]}>
        {chips.map((chip) => (
          <Button
            key={chip.key}
            onPress={chip.onPress ?? (() => {})}
            modifiers={[
              buttonStyle(
                glass
                  ? chip.picked
                    ? 'glassProminent'
                    : 'glass'
                  : chip.picked
                    ? 'borderedProminent'
                    : 'bordered',
              ),
              buttonBorderShape('circle'),
              disabled(chip.onPress === undefined),
              ...(chip.accessible === undefined
                ? []
                : [
                    accessibilityLabel(chip.accessible),
                    accessibilityAddTraits(chip.picked ? ['isSelected'] : []),
                  ]),
            ]}
          >
            <RNHostView matchContents>
              <View
                style={{
                  width: size,
                  height: size,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {placeholder ? null : (
                  <ModelFilterGlyph
                    brand={chip.brand}
                    sub={chip.sub}
                    size={theme.type.title.line}
                  />
                )}
              </View>
            </RNHostView>
          </Button>
        ))}
      </HStack>
    </ScrollView>
  );
}

export function NativeSessionModelSheet({
  visible,
  title,
  closeLabel,
  note,
  failure,
  retryLabel,
  sections,
  skeleton,
  filters,
  filter,
  filterLabel,
  effort,
  effortLabel,
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
  onEffort,
  onChoose,
}: SessionModelSheetProps) {
  const theme = useDesignTheme();
  const [shown, setShown] = useState(visible);
  const [detent, setDetent] = useState<'medium' | 'large'>('medium');
  if (visible && !shown) setShown(true);
  if (!shown) return null;
  const strip =
    filters.length === 0 ? null : (
      <Section key="filters">
        <FilterStrip
          label={filterLabel}
          chips={filters.map((entry) => ({
            key: entry.key,
            brand: entry.brand,
            sub: entry.source === 'sub',
            picked: entry.key === filter,
            accessible: entry.accessible,
            onPress: () => onFilter(entry.key === filter ? undefined : entry.key),
          }))}
        />
      </Section>
    );
  return (
    <Host colorScheme={theme.scheme} pointerEvents="none" style={{ position: 'absolute' }}>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(presented) => {
          if (!presented) onClose();
        }}
        onDismiss={() => {
          setShown(false);
          setDetent('medium');
        }}
      >
        <Group
          modifiers={[
            presentationDetents(['medium', 'large'], {
              selection: detent,
              onSelectionChange: (next) => setDetent(next === 'large' ? 'large' : 'medium'),
            }),
            presentationDragIndicator('visible'),
          ]}
        >
          <NavigationStack>
            <Toolbar>
              <List
                modifiers={[
                  listStyle('insetGrouped'),
                  scrollContentBackground('hidden'),
                  navigationTitle(title),
                  navigationBarTitleDisplayMode('inline'),
                ]}
              >
                {failure !== undefined ? (
                  <Section footer={<Text>{failure}</Text>}>
                    <Button label={retryLabel} onPress={onRetry} />
                  </Section>
                ) : null}
                {note === undefined ? null : (
                  <Section>
                    <Text modifiers={[foregroundStyle(PlatformColor('secondaryLabel'))]}>
                      {note}
                    </Text>
                  </Section>
                )}
                {loading
                  ? skeleton.flatMap((section) => [
                      <Section
                        key={section.id}
                        {...(section.title ? { title: section.title } : {})}
                      >
                        {Array.from({ length: section.rows }, (_, row) => (
                          <Button
                            key={row}
                            onPress={() => {}}
                            modifiers={[
                              disabled(true),
                              redacted('placeholder'),
                              accessibilityLabel(refreshingLabel),
                            ]}
                          >
                            <RowContent
                              name={row % 2 === 0 ? title : `${title} ${title}`}
                              brand={undefined}
                              detail={refreshLabel}
                              tag={undefined}
                              dim={false}
                              trailing="none"
                            />
                          </Button>
                        ))}
                      </Section>,
                      ...(section.id === 'default'
                        ? [
                            <Section key="filters">
                              <FilterStrip
                                label={filterLabel}
                                chips={Array.from({ length: FILTER_SKELETON_CHIPS }, (_, key) => ({
                                  key: String(key),
                                  brand: undefined,
                                  sub: false,
                                  picked: false,
                                }))}
                              />
                            </Section>,
                          ]
                        : []),
                    ])
                  : sections.flatMap((section) => [
                      <Section
                        key={section.id}
                        {...(section.title ? { title: section.title } : {})}
                      >
                        {section.data.flatMap((item) => [
                          <Button
                            key={item.key}
                            onPress={() => onChoose(item.key)}
                            modifiers={[
                              accessibilityLabel(item.accessible),
                              disabled(item.disabled === true || saving !== undefined),
                            ]}
                          >
                            <RowContent
                              name={item.name}
                              brand={item.brand}
                              detail={saving === item.key ? savingLabel : item.detail}
                              tag={item.tag}
                              dim={item.disabled === true}
                              trailing={
                                saving === item.key
                                  ? 'saving'
                                  : current === item.key
                                    ? 'check'
                                    : 'none'
                              }
                            />
                          </Button>,
                          ...(effort !== undefined && effort.key === item.key
                            ? [
                                <Picker<string>
                                  key={`${item.key}:effort`}
                                  testID="session-model-effort"
                                  label={effortLabel}
                                  selection={effort.current}
                                  onSelectionChange={onEffort}
                                  modifiers={[
                                    pickerStyle('menu'),
                                    tint(theme.color.muted),
                                    disabled(saving !== undefined),
                                    accessibilityElement('combine'),
                                    accessibilityLabel(effortLabel),
                                    accessibilityValue(
                                      effort.options.find((option) => option.id === effort.current)
                                        ?.name ?? '',
                                    ),
                                  ]}
                                >
                                  {effort.options.map((option) => (
                                    <Text key={option.id} modifiers={[tag(option.id)]}>
                                      {option.name}
                                    </Text>
                                  ))}
                                </Picker>,
                              ]
                            : []),
                        ])}
                      </Section>,
                      ...(section.id === 'default' && strip !== null ? [strip] : []),
                    ])}
              </List>
              <Toolbar.Content>
                <ToolbarItem placement="cancellationAction">
                  {Number(Platform.Version) >= 26 ? (
                    <Button
                      role="close"
                      systemImage="xmark"
                      onPress={onClose}
                      modifiers={[accessibilityLabel(closeLabel)]}
                    />
                  ) : (
                    <Button onPress={onClose} modifiers={[accessibilityLabel(closeLabel)]}>
                      <Image
                        systemName="xmark"
                        modifiers={[font({ textStyle: 'body', weight: 'semibold' })]}
                      />
                    </Button>
                  )}
                </ToolbarItem>
                <ToolbarItem placement="primaryAction">
                  {refreshing ? (
                    <ProgressView modifiers={[accessibilityLabel(refreshingLabel)]} />
                  ) : (
                    <Button
                      label={refreshLabel}
                      systemImage="arrow.clockwise"
                      onPress={onRefresh}
                      modifiers={[accessibilityLabel(refreshLabel), disabled(saving !== undefined)]}
                    />
                  )}
                </ToolbarItem>
              </Toolbar.Content>
            </Toolbar>
          </NavigationStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}
