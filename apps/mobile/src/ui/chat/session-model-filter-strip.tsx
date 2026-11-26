import { Pressable, View } from 'react-native';

import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import { edge, radius, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { SystemSymbol, type SystemSymbolProps } from '../primitives/system-symbol';
import { rowSymbol } from '../primitives/row-icon';
import { ModelBrandIcon } from './model-brand-icon';
import { ModelPickerFilters } from './model-picker-filters';
import { SHEET_GROUP, SheetHeading } from './sheet';
import type { SessionModelFilter, SessionModelSkeletonSection } from './session-model-sections';

export const FILTER_SKELETON_CHIPS = 5;

export const SUBSCRIPTION_BADGE_SYMBOL = {
  ios: 'powerplug.portrait.fill',
  android: 'power',
} as const satisfies SystemSymbolProps['name'];

export function ModelFilterGlyph({
  brand,
  sub,
  size,
  group = false,
  badgeSymbol = SUBSCRIPTION_BADGE_SYMBOL,
}: {
  brand: ModelBrand | undefined;
  sub: boolean;
  size: number;
  group?: boolean;
  badgeSymbol?: SystemSymbolProps['name'];
}) {
  const theme = useDesignTheme();
  const badge = Math.round(size * 0.55);
  if (group)
    return <SystemSymbol name={rowSymbol('stacked')} color={theme.color.muted} size={size} />;
  return (
    <View style={{ width: size, height: size }}>
      <ModelBrandIcon brand={brand} size={size} color={theme.color.muted} />
      {sub ? (
        <View
          testID="model-filter-sub-badge"
          style={{
            position: 'absolute',
            right: -badge / 3,
            bottom: -badge / 3,
            width: badge,
            height: badge,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.color.accent,
            borderWidth: edge.hairline,
            borderColor: theme.layer[SHEET_GROUP].fill,
          }}
        >
          <SystemSymbol name={badgeSymbol} color={theme.color.onAccent} size={badge * 0.62} />
        </View>
      ) : null}
    </View>
  );
}

export function filterAccessibleName(
  filter: Pick<SessionModelFilter, 'title' | 'source'>,
  sub: string,
) {
  return filter.source === 'sub' ? `${filter.title} ${sub}` : filter.title;
}

export function ModelFilterStrip({
  filters,
  active,
  label,
  sub,
  onFilter,
}: {
  filters: readonly SessionModelFilter[];
  active: string | undefined;
  label: string;
  sub: string;
  onFilter(key: string | undefined): void;
}) {
  const theme = useDesignTheme();
  const size = theme.touch;
  const layer = theme.layer[SHEET_GROUP];
  return (
    <ModelPickerFilters label={label}>
      {filters.map((filter) => {
        const picked = filter.key === active;
        return (
          <Pressable
            key={filter.key}
            testID={`session-model-filter-${filter.key}`}
            accessibilityRole="button"
            accessibilityLabel={filterAccessibleName(filter, sub)}
            accessibilityState={{ selected: picked }}
            onPress={() => onFilter(picked ? undefined : filter.key)}
            android_ripple={{ color: pressTint(theme.color.fg), borderless: true }}
            style={({ pressed }) => ({
              width: size,
              height: size,
              borderRadius: radius.round,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: picked ? layer.chosen : pressed ? layer.pressed : layer.fill,
              borderWidth: edge.hairline,
              borderColor: picked ? theme.color.accent : 'transparent',
            })}
          >
            <ModelFilterGlyph
              brand={filter.brand}
              sub={filter.source === 'sub'}
              group={filter.source === 'group'}
              size={theme.type.title.line}
            />
          </Pressable>
        );
      })}
    </ModelPickerFilters>
  );
}

function Bar({ width, height }: { width: number; height: number }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius.sm,
        backgroundColor: theme.layer[SHEET_GROUP].inset,
      }}
    />
  );
}

export function ModelFilterStripSkeleton() {
  const theme = useDesignTheme();
  return (
    <ModelPickerFilters>
      {Array.from({ length: FILTER_SKELETON_CHIPS }, (_, index) => (
        <View
          key={index}
          style={{
            width: theme.touch,
            height: theme.touch,
            borderRadius: radius.round,
            backgroundColor: theme.layer[SHEET_GROUP].fill,
          }}
        />
      ))}
    </ModelPickerFilters>
  );
}

export function SessionModelSkeletonRows({
  skeleton,
  label,
}: {
  skeleton: readonly SessionModelSkeletonSection[];
  label: string;
}) {
  const theme = useDesignTheme();
  const icon = theme.type.title.line * theme.fontScale;
  return (
    <View
      testID="sheet-skeleton"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ paddingBottom: space.x5 }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ gap: 0 }}
      >
        {skeleton.map((section) => (
          <View key={section.id}>
            {section.title === '' ? null : <SheetHeading>{section.title}</SheetHeading>}
            {Array.from({ length: section.rows }, (_, row) => (
              <SettingsGroupItem
                key={row}
                first={row === 0}
                last={row === section.rows - 1}
                on={SHEET_GROUP}
              >
                <SettingsRow
                  on={SHEET_GROUP}
                  title={' '}
                  detail={' '}
                  leading={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x4 }}>
                      <View
                        style={{
                          width: icon,
                          height: icon,
                          borderRadius: radius.round,
                          backgroundColor: theme.layer[SHEET_GROUP].inset,
                        }}
                      />
                      <View style={{ gap: space.x2 }}>
                        <Bar
                          width={row % 2 === 0 ? icon * 5 : icon * 4}
                          height={theme.type.body.line * 0.6}
                        />
                        <Bar width={icon * 3} height={theme.type.meta.line * 0.6} />
                      </View>
                    </View>
                  }
                />
              </SettingsGroupItem>
            ))}
            {section.id === 'default' ? <ModelFilterStripSkeleton /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}
