import { useRouter } from 'expo-router';
import { ACTIVITY_COUNT_KINDS } from '../../host/activity-count';
import {
  activityCountPreferences,
  useActivityCountPreferences,
} from '../../host/native-activity-count';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsForm } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { useStrings } from '../strings';

export function ActivityCountLink() {
  const t = useStrings();
  const router = useRouter();
  const { kinds } = useActivityCountPreferences();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.activityCountSettings.title}
      icon="activityCount"
      detail={
        kinds.length
          ? kinds.map((kind) => t.activityCountSettings[kind]).join(' · ')
          : t.activityCountSettings.none
      }
      disclosure
      onPress={() => router.push('/settings/activity-count')}
    />
  );
}

export function ActivityCountSettings() {
  const t = useStrings();
  const state = useActivityCountPreferences();
  return (
    <SettingsForm>
      <SettingsSection
        on={SHEET_GROUP}
        footer={state.storageError ? t.activityCountSettings.error : t.activityCountSettings.hint}
      >
        {ACTIVITY_COUNT_KINDS.map((kind) => (
          <SettingsRow
            key={kind}
            on={SHEET_GROUP}
            title={t.activityCountSettings[kind]}
            control={{
              kind: 'switch',
              value: state.kinds.includes(kind),
              onChange: (enabled) =>
                activityCountPreferences.setKinds(
                  enabled ? [...state.kinds, kind] : state.kinds.filter((value) => value !== kind),
                ),
              disabled: !state.loaded,
            }}
          />
        ))}
      </SettingsSection>
    </SettingsForm>
  );
}
