import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import type { HostClient } from '@botharness/host-client/client';
import { DEFAULT_MODEL_PRESET_ID } from '@botharness/host-client/model-plans';
import type { ModelPreset } from '@botharness/host-client/bot-settings';
import { useHostSession } from '../../host/host-session';
import { space } from '../design/tokens';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsGroupItem, SettingsHeading, SettingsRow } from '../primitives/settings-row';
import { SheetPage } from '../primitives/sheet-page';
import { useStrings } from '../strings';
import { RouteIcon } from './model-route-label';
import { presetDetail, presetFront } from './model-route-text';
import { useModels } from './model-settings-screen';
import { RoutingGroupLink, type RoutingGroupLinkItem } from './routing-group-links';
import { SHEET_GROUP, SheetFailed, SheetLoading, SheetNote } from './sheet';

export function ModelConfigurationScreen() {
  const t = useStrings();
  const { client, saved } = useHostSession();
  if (client === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return <ModelConfigurationView key={saved?.hostId} client={client} />;
}

function ModelConfigurationView({ client }: { client: HostClient }) {
  const t = useStrings();
  const router = useRouter();
  const models = useModels(client, { kind: 'global' });
  const value = models.value;
  const page = (body: React.ReactNode) => <SheetPage title={t.modelConfig.title}>{body}</SheetPage>;
  if (value === undefined)
    return page(
      models.error === undefined ? (
        <SheetLoading />
      ) : (
        <SheetFailed message={t.modelFailed} onRetry={models.refresh} />
      ),
    );
  const pinned = value.presets.find((preset) => preset.id === DEFAULT_MODEL_PRESET_ID);
  const others = value.presets.filter((preset) => preset.id !== DEFAULT_MODEL_PRESET_ID);
  const openPreset = (preset: ModelPreset) =>
    router.push({ pathname: '/settings/model-preset', params: { id: preset.id } });
  const presetRow = (preset: ModelPreset, first: boolean, last: boolean) => (
    <SettingsGroupItem key={preset.id} first={first} last={last} on={SHEET_GROUP}>
      <SettingsRow
        on={SHEET_GROUP}
        testID={`model-config-preset-${preset.id}`}
        title={preset.name}
        leading={<RouteIcon value={value} route={presetFront(value, preset)} />}
        detail={presetDetail(value, preset)}
        disclosure
        control={{ kind: 'chevron' }}
        onPress={() => openPreset(preset)}
      />
    </SettingsGroupItem>
  );
  const groupItems: RoutingGroupLinkItem[] = [
    ...(value.groups ?? []).map((group) => ({ kind: 'group' as const, group })),
    { kind: 'add' },
  ];
  const heading = (text: string) => (
    <View style={{ paddingTop: space.x4, paddingBottom: space.x2 }}>
      <SettingsHeading>{text}</SettingsHeading>
    </View>
  );
  return page(
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space.x3 }}>
      <SheetNote>{t.modelConfig.hint}</SheetNote>
      {models.error === undefined ? null : <SheetNote>{models.error}</SheetNote>}
      {models.busy ? <LoadingIndicator /> : null}
      {pinned === undefined ? null : (
        <>
          {heading(t.modelConfig.sectionDefault)}
          {presetRow(pinned, true, true)}
        </>
      )}
      {heading(t.modelConfig.sectionPresets)}
      {others.map((preset, index) => presetRow(preset, index === 0, false))}
      <SettingsGroupItem first={others.length === 0} last on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          testID="model-config-preset-new"
          title={t.modelConfig.newPreset}
          {...(others.length === 0 ? { detail: t.modelConfig.emptyPresets } : {})}
          control={{ kind: 'add' }}
          onPress={() => router.push('/settings/model-preset-new')}
        />
      </SettingsGroupItem>
      {groupItems.map((item, index) => (
        <RoutingGroupLink
          key={item.kind === 'add' ? 'group-add' : `group:${item.group.id}`}
          item={item}
          first={index === 0}
          models={value.models}
          groups={value.groups ?? []}
        />
      ))}
    </ScrollView>,
  );
}
