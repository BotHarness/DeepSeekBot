import { useState, useSyncExternalStore } from 'react';
import { mobileTelemetry } from '../../telemetry/native';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Toggle } from '../primitives/toggle';
import { t } from '../strings';

export function StatisticsSettings() {
  const state = useSyncExternalStore(mobileTelemetry.subscribe, mobileTelemetry.getSnapshot);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <SettingsSection
      footer={
        state.storageError
          ? `${t.statisticsStorageError}${expanded ? ` ${t.statisticsNotice}` : ''}`
          : expanded
            ? t.statisticsNotice
            : undefined
      }
    >
      <SettingsRow
        title={t.statisticsTitle}
        trailing={
          <Toggle
            label={t.statisticsTitle}
            value={state.enabled}
            disabled={!state.loaded || saving}
            onChange={(value) => {
              setSaving(true);
              void mobileTelemetry.setEnabled(value).finally(() => setSaving(false));
            }}
          />
        }
      />
      <SettingsRow
        title={expanded ? t.statisticsHideDetails : t.statisticsDetails}
        tone="muted"
        onPress={() => setExpanded(!expanded)}
        expanded={expanded}
      />
    </SettingsSection>
  );
}
