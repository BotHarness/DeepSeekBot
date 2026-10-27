import { useRouter } from 'expo-router';
import { ACTIVITY_COUNT_KINDS } from '../../host/activity-count';
import {
  activityCountPreferences,
  useActivityCountPreferences,
} from '../../host/native-activity-count';
import { SHEET_GROUP } from '../chat/sheet';
import { RowIcon } from '../primitives/row-icon';
import { SettingsForm } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Toggle } from '../primitives/toggle';
import { useStrings } from '../strings';

export function ActivityCountLink() {
  const t = useStrings();
  const router = useRouter();
  const { kinds } = useActivityCountPreferences();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.activityCountSettings.title}
      leading={<RowIcon name="activityCount" />}
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
            trailing={
              <Toggle
                on={SHEET_GROUP}
                label={t.activityCountSettings[kind]}
                value={state.kinds.includes(kind)}
                disabled={!state.loaded}
                onChange={(enabled) =>
                  activityCountPreferences.setKinds(
                    enabled
                      ? [...state.kinds, kind]
                      : state.kinds.filter((value) => value !== kind),
                  )
                }
              />
            }
          />
        ))}
      </SettingsSection>
    </SettingsForm>
  );
}
