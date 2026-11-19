import type { routingGroupEngineMemberRow } from '@botharness/host-client/model-catalog';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import { Pressable, View } from 'react-native';

import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { SettingsRow } from '../primitives/settings-row';
import { SwipeRow } from '../primitives/swipe-row';
import { SystemSymbol } from '../primitives/system-symbol';
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { ModelBrandIcon } from './model-brand-icon';
import { SHEET_GROUP } from './sheet';

export function RoutingGroupMemberRow({
  index,
  name,
  title,
  detail,
  brand,
  engineRow,
  engineReason,
  usable,
  moveUp,
  moveDown,
  remove,
}: {
  index: number;
  name: string;
  title: string;
  detail: string | undefined;
  brand: ModelBrand | undefined;
  engineRow: ReturnType<typeof routingGroupEngineMemberRow> | undefined;
  engineReason: string | undefined;
  usable: boolean;
  moveUp: (() => void) | undefined;
  moveDown: (() => void) | undefined;
  remove: (() => void) | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const tone = usable && engineReason === undefined ? 'fg' : 'muted';
  const position = `${index + 1}. `;
  const memberDetail =
    engineRow === undefined
      ? detail
      : [
          engineRow.detail,
          engineRow.isDefault ? t.routingGroup.defaultTag : undefined,
          engineReason === undefined
            ? undefined
            : `${t.routingGroup.unavailable} · ${engineReason}`,
        ]
          .filter(Boolean)
          .join(' · ');
  const leading =
    engineRow !== undefined ? (
      <SystemSymbol
        name={{ ios: 'puzzlepiece.extension', android: 'extension' }}
        size={theme.type.meta.size}
        color={theme.color[tone]}
      />
    ) : brand === undefined ? undefined : (
      <ModelBrandIcon brand={brand} color={theme.color[tone]} size={theme.type.title.line} />
    );
  const actions = [
    { key: 'up', label: t.routingGroup.moveUp(name), run: moveUp, Icon: ChevronUpIcon },
    { key: 'down', label: t.routingGroup.moveDown(name), run: moveDown, Icon: ChevronDownIcon },
    { key: 'remove', label: t.routingGroup.removeMember(name), run: remove, Icon: TrashIcon },
  ];
  const accessory = (
    <View style={{ flexDirection: 'row' }}>
      {actions.map(({ key, label, run, Icon }) => (
        <Pressable
          key={key}
          testID={`routing-group-member-${index}-${key}`}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: run === undefined }}
          disabled={run === undefined}
          onPress={run}
          android_ripple={{ color: pressTint(theme.color.fg), borderless: true }}
          style={({ pressed }) => ({
            width: theme.touch,
            height: theme.touch,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.round,
            backgroundColor: pressed ? theme.layer.raised.pressed : undefined,
          })}
        >
          <Icon
            size={theme.type.body.line}
            color={run === undefined ? theme.color.subtle : theme.color.fg}
          />
        </Pressable>
      ))}
    </View>
  );
  return (
    <SwipeRow
      contextMenu={false}
      actions={
        remove === undefined
          ? []
          : [
              {
                key: 'remove-routing-member',
                label: t.routingGroup.remove,
                tone: 'danger',
                icon: TrashIcon,
                run: remove,
              },
            ]
      }
    >
      <SettingsRow
        on={SHEET_GROUP}
        title={position + (engineRow?.title ?? title)}
        accessibilityLabel={[position + name, memberDetail].filter(Boolean).join(', ')}
        detail={memberDetail}
        tone={tone}
        leading={leading}
        accessory={theme.largeText ? undefined : accessory}
      />
      {theme.largeText ? (
        <View style={{ alignItems: 'flex-end', paddingHorizontal: space.x3 }}>{accessory}</View>
      ) : null}
    </SwipeRow>
  );
}
