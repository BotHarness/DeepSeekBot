import { Box, Column, RNHostView, Text } from '@expo/ui/jetpack-compose';
import {
  border,
  clickable,
  clip,
  defaultMinSize,
  fillMaxWidth,
  padding,
  semantics,
  Shapes,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ComponentProps } from 'react';

import { typeCustom } from '@botharness/host-client/requests';
import { materialType, useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useStrings } from '../strings';
import { CardField } from './action-card';
import type { QuestionFields as SharedQuestionFields } from './question-fields';
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
}: ComponentProps<typeof SharedQuestionFields>) {
  const t = useStrings();
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  const multiple = question.multiSelect === true;
  const inputLabel = `${t.otherAnswer}: ${question.question}`;
  const placeholder = question.options?.length ? t.otherAnswer : t.typeAnswer;
  return (
    <Column verticalArrangement={{ spacedBy: space.x3 }} modifiers={[fillMaxWidth()]}>
      {heading ? (
        <Column verticalArrangement={{ spacedBy: space.x1 }}>
          {question.header === undefined ? null : (
            <Text
              color={roles.onSurfaceVariant}
              style={{ typography: materialType.meta, fontWeight: 'bold' }}
            >
              {question.header}
            </Text>
          )}
          <Text style={{ typography: materialType.body, fontWeight: 'bold' }}>
            {question.question}
          </Text>
          {question.detail === undefined ? null : (
            <Text color={roles.onSurfaceVariant} style={{ typography: materialType.meta }}>
              {question.detail}
            </Text>
          )}
        </Column>
      ) : null}
      {multiple ? (
        <Text color={roles.onSurfaceVariant} style={{ typography: materialType.meta }}>
          {t.multiSelectHint}
        </Text>
      ) : null}
      {question.options?.length ? (
        <RNHostView matchContents={{ vertical: true }} modifiers={[fillMaxWidth()]}>
          <QuestionOptions
            question={question}
            draft={draft}
            disabled={disabled}
            onChange={onChange}
            {...(onPick === undefined ? {} : { onPick })}
          />
        </RNHostView>
      ) : null}
      {inChat ? (
        <Text color={roles.onSurfaceVariant} style={{ typography: materialType.meta }}>
          {t.replyInChat}
        </Text>
      ) : onExpand !== undefined ? (
        <Box
          modifiers={[
            fillMaxWidth(),
            defaultMinSize({ minHeight: theme.touch }),
            clip(Shapes.RoundedCorner(radius.xs)),
            border(edge.hairline, roles.outline),
            ...(disabled ? [] : [clickable(onExpand)]),
            semantics({ contentDescription: inputLabel }),
            padding(space.x5, space.x4, space.x5, space.x4),
          ]}
        >
          <Text
            {...(draft.custom === '' ? { color: roles.onSurfaceVariant } : {})}
            style={{ typography: 'bodyLarge' }}
          >
            {draft.custom === '' ? placeholder : draft.custom}
          </Text>
        </Box>
      ) : (
        <CardField
          label={placeholder}
          accessibilityLabel={inputLabel}
          editable={!disabled}
          value={draft.custom}
          onChangeText={(text) => onChange(typeCustom(question, draft, text))}
        />
      )}
    </Column>
  );
}
