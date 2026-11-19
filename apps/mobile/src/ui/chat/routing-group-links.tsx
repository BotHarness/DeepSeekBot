import { useRouter } from 'expo-router';
import { View } from 'react-native';

import type { ModelCatalogGroup } from '@botharness/host-client/model-catalog';

import { space } from '../design/tokens';
import { SettingsGroupItem, SettingsHeading, SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { SHEET_GROUP } from './sheet';

export type RoutingGroupLinkItem = { kind: 'group'; group: ModelCatalogGroup } | { kind: 'add' };

export function RoutingGroupLink({ item, first }: { item: RoutingGroupLinkItem; first: boolean }) {
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
        <SettingsRow
          on={SHEET_GROUP}
          testID={group === undefined ? 'routing-group-add' : `routing-group-edit-${group.id}`}
          title={group?.name ?? t.routingGroup.add}
          icon={group === undefined ? undefined : 'model'}
          disclosure={group !== undefined}
          control={group === undefined ? { kind: 'add' } : { kind: 'chevron' }}
          onPress={() =>
            group === undefined
              ? router.push('/settings/routing-group')
              : router.push({ pathname: '/settings/routing-group', params: { id: group.id } })
          }
        />
      </SettingsGroupItem>
    </>
  );
}
