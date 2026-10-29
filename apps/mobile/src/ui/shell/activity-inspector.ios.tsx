import { Form, Host, Picker, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { accessibilityIdentifier, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { requireNativeView } from 'expo';
import type { ReactNode } from 'react';
import { View, type NativeSyntheticEvent } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import {
  ACTIVITY_SECTIONS,
  DEFAULT_ACTIVITY,
  sectionLabel,
  type ActivitySection,
  type ActivitySort,
} from './activity-filters';
import type { ActivityInspectorProps } from './activity-inspector';

const Inspector = requireNativeView<{
  children: ReactNode;
  isPresented: boolean;
  title: string;
  closeLabel: string;
  resetLabel: string;
  onIsPresentedChange(event: NativeSyntheticEvent<{ isPresented: boolean }>): void;
  onReset(): void;
}>('NativeInspector', 'InspectorView');
const ALL = '*';

export function ActivityInspector({
  children,
  visible,
  onClose,
  filter,
  sort,
  bots,
  channels,
  onFilter,
  onSort,
}: ActivityInspectorProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <View style={{ flex: 1 }}>
      {children}
      <Host
        style={{ position: 'absolute', width: 1, height: 1, top: 0, left: 0 }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeArea="container"
      >
        <Inspector
          isPresented={visible}
          title={t.activityOptions}
          closeLabel={t.close}
          resetLabel={t.activityReset}
          onIsPresentedChange={({ nativeEvent }) => {
            if (!nativeEvent.isPresented) onClose();
          }}
          onReset={() => {
            onFilter(DEFAULT_ACTIVITY);
            onSort('default');
          }}
        >
          <Form>
            <Section title={t.activityCategory}>
              <Picker<ActivitySection>
                selection={filter.section}
                onSelectionChange={(section) => onFilter({ ...filter, section })}
                modifiers={[
                  pickerStyle('inline'),
                  accessibilityIdentifier('activity-filter-category'),
                ]}
              >
                {ACTIVITY_SECTIONS.map((section) => (
                  <Text key={section} modifiers={[tag(section)]}>
                    {sectionLabel(section)}
                  </Text>
                ))}
              </Picker>
            </Section>
            <Section title={t.activitySort}>
              <Picker<ActivitySort>
                selection={sort}
                onSelectionChange={onSort}
                modifiers={[pickerStyle('inline'), accessibilityIdentifier('activity-filter-sort')]}
              >
                <Text modifiers={[tag('default')]}>{t.activitySortDefault}</Text>
                <Text modifiers={[tag('newest')]}>{t.activitySortNewest}</Text>
                <Text modifiers={[tag('oldest')]}>{t.activitySortOldest}</Text>
              </Picker>
            </Section>
            <Section>
              <Toggle
                label={t.activityUnreadOnly}
                isOn={filter.unreadOnly === true}
                onIsOnChange={(unreadOnly) => onFilter({ ...filter, unreadOnly })}
                modifiers={[accessibilityIdentifier('activity-filter-unread')]}
              />
              <Picker<string>
                label={t.bots}
                selection={filter.bot ?? ALL}
                onSelectionChange={(bot) =>
                  onFilter({ ...filter, bot: bot === ALL ? undefined : bot })
                }
                modifiers={[pickerStyle('menu'), accessibilityIdentifier('activity-filter-bot')]}
              >
                <Text modifiers={[tag(ALL)]}>{t.filterAllBots}</Text>
                {bots.map((bot) => (
                  <Text key={bot.slug} modifiers={[tag(bot.slug)]}>
                    {bot.name}
                  </Text>
                ))}
              </Picker>
              <Picker<string>
                label={t.channels}
                selection={filter.channel ?? ALL}
                onSelectionChange={(channel) =>
                  onFilter({ ...filter, channel: channel === ALL ? undefined : channel })
                }
                modifiers={[
                  pickerStyle('menu'),
                  accessibilityIdentifier('activity-filter-channel'),
                ]}
              >
                <Text modifiers={[tag(ALL)]}>{t.activityAllChannels}</Text>
                {channels.map((channel) => (
                  <Text key={channel.id} modifiers={[tag(channel.id)]}>
                    {channel.name}
                  </Text>
                ))}
              </Picker>
            </Section>
          </Form>
        </Inspector>
      </Host>
    </View>
  );
}
