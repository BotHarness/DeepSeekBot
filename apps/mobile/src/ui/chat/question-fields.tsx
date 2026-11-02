import { Pressable, View } from 'react-native';

import { toggleOption, typeCustom, type QuestionDraft } from '../../host/requests';
import type { QuestionItem } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
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
  const badge = theme.type.body.line * theme.fontScale + space.x2;
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={t.option(letter(index), label)}
      accessibilityState={{ checked: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        paddingHorizontal: space.x4,
        paddingVertical: space.x3,
        borderTopWidth: index === 0 ? 0 : edge.hairline,
        borderTopColor: theme.layer.well.divider,
        backgroundColor: chosen
          ? theme.layer.well.chosen
          : pressed
            ? theme.layer.well.pressed
            : theme.layer.well.fill,
      })}
    >
      <View
        style={{
          width: badge,
          height: badge,
          borderRadius: multiple ? radius.sm : radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: chosen ? theme.color.accent : theme.layer.well.inset,
        }}
      >
        <Text variant="meta" strong tone={chosen ? 'onAccent' : 'muted'}>
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

export function QuestionFields({
  question,
  draft,
  heading,
  disabled,
  inChat,
  onExpand,
  onChange,
  onPick,
}: {
  question: QuestionItem;
  draft: QuestionDraft;
  heading: boolean;
  disabled: boolean;
  inChat: boolean;
  onExpand?(): void;
  onChange(next: QuestionDraft): void;
  onPick?(label: string): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const multiple = question.multiSelect === true;
  const inputLabel = `${t.otherAnswer}: ${question.question}`;
  const placeholder = question.options?.length ? t.otherAnswer : t.typeAnswer;
  return (
    <View style={{ gap: space.x3 }}>
      {heading ? (
        <View style={{ gap: space.x1 }}>
          {question.header === undefined ? null : (
            <Text variant="meta" tone="muted" strong>
              {question.header}
            </Text>
          )}
          <Text strong>{question.question}</Text>
          {question.detail === undefined ? null : (
            <Text selectable variant="meta" tone="muted">
              {question.detail}
            </Text>
          )}
        </View>
      ) : null}
      {multiple ? (
        <Text variant="meta" tone="muted">
          {t.multiSelectHint}
        </Text>
      ) : null}
      {question.options?.length ? (
        <View
          accessibilityLabel={question.question}
          style={{
            overflow: 'hidden',
            borderRadius: radius.md,
            backgroundColor: theme.layer.well.fill,
          }}
        >
          {question.options.map((option, index) => (
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
      ) : null}
      {inChat ? (
        <Text variant="meta" tone="muted">
          {t.replyInChat}
        </Text>
      ) : onExpand !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={inputLabel}
          disabled={disabled}
          onPress={onExpand}
          style={{
            minHeight: theme.touch,
            paddingHorizontal: space.x4,
            paddingVertical: space.x3,
            backgroundColor: theme.layer.field.fill,
            borderColor: theme.layer.field.edge,
            borderWidth: edge.hairline,
            borderRadius: radius.md,
          }}
        >
          <Text tone={draft.custom === '' ? 'muted' : 'fg'}>
            {draft.custom === '' ? placeholder : draft.custom}
          </Text>
        </Pressable>
      ) : (
        <TextField
          accessibilityLabel={`${t.otherAnswer}: ${question.question}`}
          label={question.options?.length ? t.otherAnswer : t.typeAnswer}
          placeholder={question.options?.length ? t.otherAnswer : t.typeAnswer}
          editable={!disabled}
          multiline
          value={draft.custom}
          onChangeText={(text) => onChange(typeCustom(question, draft, text))}
        />
      )}
    </View>
  );
}
