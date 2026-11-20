import { Pressable, View } from 'react-native';

import { toggleOption, type QuestionDraft } from '@botharness/host-client/requests';
import type { QuestionItem } from '@botharness/host-protocol/wire';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
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
  const well = theme.layer.well;
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
      style={({ pressed }) => ({
        minHeight: theme.touch,
        minWidth: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        paddingHorizontal: space.x4,
        paddingVertical: space.x3,
        borderTopWidth: index === 0 ? 0 : edge.hairline,
        borderTopColor: well.divider,
        backgroundColor: chosen ? well.chosen : pressed && !disabled ? well.pressed : well.fill,
      })}
    >
      <View
        testID="question-option-letter"
        accessible={false}
        style={{
          width: badge,
          height: badge,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          ...(chosen
            ? { backgroundColor: theme.color.accent, borderWidth: 0 }
            : {
                borderWidth: edge.hairline,
                borderColor: theme.color.muted,
                borderStyle: 'dashed',
              }),
        }}
      >
        <Text variant="meta" strong tone={chosen ? 'onAccent' : 'fg'}>
          {letter(index)}
        </Text>
      </View>
      <View style={{ flexShrink: 1, gap: space.x1 }}>
        <Text>{label}</Text>
        {description === undefined ? null : (
          <Text variant="meta" tone="muted">
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
  const theme = useDesignTheme();
  const options = question.options ?? [];
  const multiple = question.multiSelect === true;
  return options.length > 0 ? (
    <View
      testID="question-options"
      accessibilityLabel={question.question}
      style={{
        backgroundColor: theme.layer.well.fill,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}
    >
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
