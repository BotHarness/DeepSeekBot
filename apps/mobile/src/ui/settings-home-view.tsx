import { useState } from 'react';

import { SHEET_GROUP } from './chat/sheet';
import { space } from './design/tokens';
import { SearchField } from './primitives/search-field';
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import {
  filterCatalog,
  SETTINGS_GROUPS,
  type SettingsGroupKey,
} from './settings-catalog';
import { useStrings } from './strings';

export function SettingsHomeView({ onOpen }: { onOpen(route: string): void }) {
  const t = useStrings();
  const [query, setQuery] = useState('');
  const entries = filterCatalog(query, (key) => t.settingsHome[key]);
  return (
    <SettingsForm testID="settings-home">
      <SettingsFormItem>
        <SearchField
          testID="settings-home-search"
          value={query}
          inset={space.x5}
          placeholder={t.settingsHome.search}
          onChangeText={setQuery}
        />
      </SettingsFormItem>
      {SETTINGS_GROUPS.map((group: SettingsGroupKey) => {
        const rows = entries.filter((entry) => entry.group === group);
        if (rows.length === 0) return null;
        return (
          <SettingsSection key={group} title={t.settingsHome.groups[group]} on={SHEET_GROUP}>
            {rows.map((entry) => {
              const detail =
                entry.status === 'desktop'
                  ? t.settingsHome.desktopOnly
                  : entry.status === 'soon'
                    ? t.settingsHome.comingSoon
                    : undefined;
              const route = entry.route;
              return (
                <SettingsRow
                  key={entry.id}
                  on={SHEET_GROUP}
                  title={t.settingsHome[entry.label]}
                  detail={detail}
                  icon={entry.icon}
                  tone={entry.status === 'ready' ? 'fg' : 'muted'}
                  disclosure={entry.status === 'ready'}
                  testID={`settings-home-${entry.id}`}
                  onPress={
                    entry.status === 'ready' && route !== undefined
                      ? () => onOpen(route)
                      : undefined
                  }
                />
              );
            })}
          </SettingsSection>
        );
      })}
    </SettingsForm>
  );
}
