import { Pressable, View } from 'react-native';

import { typeCustom, type QuestionDraft } from '@botharness/host-client/requests';
import type { QuestionItem } from '@botharness/host-protocol/wire';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { QuestionOptions } from './question-options';

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
      <QuestionOptions
        question={question}
        draft={draft}
        disabled={disabled}
        onChange={onChange}
        {...(onPick === undefined ? {} : { onPick })}
      />
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
