import {
  Button,
  HStack,
  Host,
  Image,
  Menu,
  Picker,
  Section,
  Text,
  Toggle,
} from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { controlCase } from '../platform-copy';
import { useStrings } from '../strings';
import {
  ACTIVITY_SECTIONS,
  sectionLabel,
  type ActivitySection,
  type ActivitySort,
} from './activity-filters';
import type { ActivityHeaderActionsProps } from './activity-header-actions';

const ALL = '*';

export function ActivityHeaderActions({
  filtered,
  searching,
  options,
  onSearch,
}: ActivityHeaderActionsProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { filter, sort, bots, channels, onFilter, onSort } = options;
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  const glyph = (name: 'line.3.horizontal.decrease' | 'magnifyingglass', on: boolean) => (
    <Image
      systemName={name}
      modifiers={[
        font({ textStyle: 'body', weight: 'medium' }),
        foregroundStyle(on ? theme.color.accent : theme.color.fg),
        frame({ width: theme.touch, height: theme.touch }),
      ]}
    />
  );
  return (
    <Host key={theme.scheme} colorScheme={theme.scheme} matchContents>
      <HStack
        spacing={0}
        modifiers={[
          ...(glass
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })]
            : []),
          frame({ height: theme.touch }),
        ]}
      >
        <Menu
          label={glyph('line.3.horizontal.decrease', filtered)}
          modifiers={[
            accessibilityLabel(t.activityOptions),
            accessibilityIdentifier('activity-filter-button'),
          ]}
        >
          <Section title={t.activitySort}>
            <Picker<ActivitySort>
              selection={sort}
              onSelectionChange={onSort}
              modifiers={[pickerStyle('inline')]}
            >
              {(
                [
                  ['default', t.activitySortDefault],
                  ['newest', t.activitySortNewest],
                  ['oldest', t.activitySortOldest],
                ] as const
              ).map(([value, label]) => (
                <Text key={value} modifiers={[tag(value)]}>
                  {controlCase(label)}
                </Text>
              ))}
            </Picker>
          </Section>
          <Section title={t.activityCategory}>
            <Picker<ActivitySection>
              selection={filter.section}
              onSelectionChange={(section) => onFilter({ ...filter, section })}
              modifiers={[pickerStyle('inline')]}
            >
              {ACTIVITY_SECTIONS.map((section) => (
                <Text key={section} modifiers={[tag(section)]}>
                  {controlCase(sectionLabel(section))}
                </Text>
              ))}
            </Picker>
          </Section>
          <Section>
            <Toggle
              label={controlCase(t.activityUnreadOnly)}
              isOn={filter.unreadOnly === true}
              onIsOnChange={(unreadOnly) => onFilter({ ...filter, unreadOnly })}
            />
            <Picker<string>
              label={controlCase(t.bots)}
              selection={filter.bot ?? ALL}
              onSelectionChange={(bot) =>
                onFilter({ ...filter, bot: bot === ALL ? undefined : bot })
              }
              modifiers={[pickerStyle('menu')]}
            >
              <Text modifiers={[tag(ALL)]}>{controlCase(t.filterAllBots)}</Text>
              {bots.map((bot) => (
                <Text key={bot.slug} modifiers={[tag(bot.slug)]}>
                  {bot.name}
                </Text>
              ))}
            </Picker>
            <Picker<string>
              label={controlCase(t.channels)}
              selection={filter.channel ?? ALL}
              onSelectionChange={(channel) =>
                onFilter({ ...filter, channel: channel === ALL ? undefined : channel })
              }
              modifiers={[pickerStyle('menu')]}
            >
              <Text modifiers={[tag(ALL)]}>{controlCase(t.activityAllChannels)}</Text>
              {channels.map((channel) => (
                <Text key={channel.id} modifiers={[tag(channel.id)]}>
                  {channel.name}
                </Text>
              ))}
            </Picker>
          </Section>
        </Menu>
        <Button
          onPress={onSearch}
          modifiers={[
            buttonStyle('plain'),
            accessibilityLabel(t.activitySearch),
            accessibilityIdentifier('activity-search-button'),
          ]}
        >
          {glyph('magnifyingglass', searching)}
        </Button>
      </HStack>
    </Host>
  );
}
