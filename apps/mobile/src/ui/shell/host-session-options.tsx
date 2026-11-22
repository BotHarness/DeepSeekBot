import { FlatList, Pressable } from 'react-native';
import { Sheet } from '../chat/sheet';
import { segmentCorners } from '../design/segment-corners';
import { useDesignTheme } from '../design/theme';
import { androidSettings, space } from '../design/tokens';
import { RadioMark } from '../primitives/radio-mark';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { HeaderAction } from './header-action';

type Choice = { id: string; label: string; select(): void };
export type SessionOptionGroup = {
  id: string;
  label: string;
  selected: string;
  choices: Choice[];
};

export type HostSessionOptionsButtonProps = {
  active: boolean;
  groups: readonly SessionOptionGroup[];
  onOpen(): void;
};

export function HostSessionOptionsButton({ active, onOpen }: HostSessionOptionsButtonProps) {
  const t = useStrings().hostSessions;
  return (
    <HeaderAction
      icon="filter"
      label={t.options}
      testID="host-sessions-options"
      active={active}
      onPress={onOpen}
    />
  );
}

export type HostSessionOptionsSheetProps = {
  open: boolean;
  groups: readonly SessionOptionGroup[];
  onClose(): void;
};

type Row =
  | { kind: 'heading'; key: string; label: string }
  | {
      kind: 'choice';
      key: string;
      choice: Choice;
      selected: boolean;
      first: boolean;
      last: boolean;
    };

export function HostSessionOptionsSheet({ open, groups, onClose }: HostSessionOptionsSheetProps) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  if (!open) return null;
  const rows = groups.flatMap((group): Row[] => [
    { kind: 'heading', key: group.id, label: group.label },
    ...group.choices.map((choice, index): Row => ({
      kind: 'choice',
      key: `${group.id}:${choice.id}`,
      choice,
      selected: group.selected === choice.id,
      first: index === 0,
      last: index === group.choices.length - 1,
    })),
  ]);
  return (
    <Sheet visible label={t.options} title={t.options} onClose={onClose}>
      <FlatList
        nestedScrollEnabled
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ paddingHorizontal: space.x5, paddingBottom: space.x5 }}
        renderItem={({ item }) => {
          if (item.kind === 'heading')
            return (
              <Text
                variant="meta"
                tone="muted"
                accessibilityRole="header"
                style={{ paddingVertical: space.x3 }}
              >
                {item.label}
              </Text>
            );
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={item.choice.label}
              accessibilityState={{ checked: item.selected }}
              onPress={item.choice.select}
              style={({ pressed }) => ({
                minHeight: theme.touch,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x4,
                paddingHorizontal: space.x5,
                paddingVertical: space.x3,
                ...segmentCorners(item.first, item.last),
                marginTop: item.first ? 0 : androidSettings.segmentGap,
                backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
              })}
            >
              <RadioMark selected={item.selected} />
              <Text style={{ flex: 1 }}>{item.choice.label}</Text>
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}
