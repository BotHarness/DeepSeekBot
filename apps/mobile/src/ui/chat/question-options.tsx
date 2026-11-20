import { Pressable, View } from 'react-native';

import { toggleOption, type QuestionDraft } from '@botharness/host-client/requests';
import type { QuestionItem } from '@botharness/host-protocol/wire';
import { cardChoiceColors } from '../design/controls';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { letter } from './question-letter';

function Option({
  index,
  label,
  description,
  chosen,
  multiple,
  disabled,
  onPress,
}: {
  index: number;
  label: string;
  description?: string;
  chosen: boolean;
  multiple: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const tone = chosen ? 'primary' : 'secondary';
  const state = disabled ? (chosen ? 'selected-disabled' : 'disabled') : 'rest';
  const colors = cardChoiceColors(theme, tone, state);
  const pressedColors = cardChoiceColors(theme, tone, 'pressed');
  const badge = theme.type.body.line * theme.fontScale + space.x2;
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={t.option(letter(index), label)}
      accessibilityHint={description}
      testID={`question-option-${index}`}
      accessibilityState={{ checked: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => {
        const paint = pressed && !disabled ? pressedColors : colors;
        return {
          minHeight: theme.touch,
          minWidth: theme.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
          paddingHorizontal: space.x4,
          paddingVertical: space.x3,
          borderRadius: radius.round,
          backgroundColor: paint.fill,
        };
      }}
    >
      <View
        style={{
          width: badge,
          height: badge,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="meta" strong style={{ color: colors.ink }}>
          {letter(index)}
        </Text>
      </View>
      <View style={{ flexShrink: 1, gap: space.x1 }}>
        <Text style={{ color: colors.ink }}>{label}</Text>
        {description === undefined ? null : (
          <Text variant="meta" style={{ color: colors.ink }}>
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function QuestionOptions({
  question,
  draft,
  disabled,
  onChange,
  onPick,
}: {
  question: QuestionItem;
  draft: QuestionDraft;
  disabled: boolean;
  onChange(next: QuestionDraft): void;
  onPick?(label: string): void;
}) {
  const options = question.options ?? [];
  const multiple = question.multiSelect === true;
  return options.length > 0 ? (
    <View accessibilityLabel={question.question} style={{ gap: space.x2 }}>
      {options.map((option, index) => (
        <Option
          key={option.label}
          index={index}
          label={option.label}
          {...(option.description === undefined ? {} : { description: option.description })}
          chosen={draft.selected.includes(option.label)}
          multiple={multiple}
          disabled={disabled}
          onPress={() =>
            onPick === undefined
              ? onChange(toggleOption(question, draft, option.label))
              : onPick(option.label)
          }
        />
      ))}
    </View>
  ) : null;
}
