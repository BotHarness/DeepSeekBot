import { useState, useSyncExternalStore } from 'react';
import { mobileTelemetry } from '../../telemetry/native';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { useStrings } from '../strings';

export function StatisticsSettings() {
  const t = useStrings();
  const state = useSyncExternalStore(mobileTelemetry.subscribe, mobileTelemetry.getSnapshot);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const on = SHEET_GROUP;
  return (
    <SettingsSection
      on={on}
      footer={
        state.storageError
          ? `${t.statisticsStorageError}${expanded ? ` ${t.statisticsNotice}` : ''}`
          : expanded
            ? t.statisticsNotice
            : undefined
      }
    >
      <SettingsRow
        on={on}
        title={t.statisticsTitle}
        control={{
          kind: 'switch',
          value: state.enabled,
          onChange: (value) => {
            setSaving(true);
            void mobileTelemetry.setEnabled(value).finally(() => setSaving(false));
          },
          disabled: !state.loaded || saving,
        }}
      />
      <SettingsRow
        on={on}
        title={expanded ? t.statisticsHideDetails : t.statisticsDetails}
        onPress={() => setExpanded(!expanded)}
        expanded={expanded}
      />
    </SettingsSection>
  );
}
