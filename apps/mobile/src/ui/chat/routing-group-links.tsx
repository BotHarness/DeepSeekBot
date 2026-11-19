import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { sameModel } from '@botharness/host-client/bot-settings';
import {
  modelCatalogGroupFront,
  type ModelCatalogEntry,
  type ModelCatalogGroup,
} from '@botharness/host-client/model-catalog';

import { space } from '../design/tokens';
import { SettingsGroupItem, SettingsHeading, SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { ModelGroupPickerRow } from './model-picker-row';
import { SHEET_GROUP } from './sheet';

export type RoutingGroupLinkItem = { kind: 'group'; group: ModelCatalogGroup } | { kind: 'add' };

export function RoutingGroupLink({
  item,
  first,
  models,
}: {
  item: RoutingGroupLinkItem;
  first: boolean;
  models: readonly ModelCatalogEntry[];
}) {
  const t = useStrings();
  const router = useRouter();
  const group = item.kind === 'group' ? item.group : undefined;
  return (
    <>
      {first ? (
        <View style={{ paddingTop: space.x4, paddingBottom: space.x2 }}>
          <SettingsHeading>{t.modelSettings.groups}</SettingsHeading>
        </View>
      ) : null}
      <SettingsGroupItem first={first} last={group === undefined} on={SHEET_GROUP}>
        {group === undefined ? (
          <SettingsRow
            on={SHEET_GROUP}
            testID="routing-group-add"
            title={t.routingGroup.add}
            control={{ kind: 'add' }}
            onPress={() => router.push('/settings/routing-group')}
          />
        ) : (
          <ModelGroupPickerRow
            group={group}
            front={groupFront(group, models)}
            usable={groupUsable(group, models)}
            showCount
            testID={`routing-group-edit-${group.id}`}
            disclosure
            control={{ kind: 'chevron' }}
            onPress={() =>
              router.push({ pathname: '/settings/routing-group', params: { id: group.id } })
            }
          />
        )}
      </SettingsGroupItem>
    </>
  );
}

function groupFront(group: ModelCatalogGroup, models: readonly ModelCatalogEntry[]) {
  const front = modelCatalogGroupFront(group, models);
  return models.find((entry) => sameModel(entry, front));
}

function groupUsable(group: ModelCatalogGroup, models: readonly ModelCatalogEntry[]) {
  return (
    group.restingUntil === undefined &&
    group.routes.some(
      (route) => models.find((entry) => sameModel(entry, route))?.credential === undefined,
    )
  );
}
