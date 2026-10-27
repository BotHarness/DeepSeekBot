import { Host } from '@expo/ui';
import { FlowRow, Icon, InputChip, Text as ComposeText } from '@expo/ui/jetpack-compose';
import {
  defaultMinSize,
  fillMaxWidth,
  semantics,
  testID,
} from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';
import { creationTags } from '../../host/bot-creation-tags';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import { CreationField } from './creation-field';
import type { CreationTagsFieldProps } from './creation-tags-field';
import { Text } from './text';

export function CreationTagsField({ value, onChange, disabled }: CreationTagsFieldProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  const tags = creationTags(value.tags);
  return (
    <View style={{ gap: space.x2 }}>
      {tags.length ? (
        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
        >
          <FlowRow
            horizontalArrangement={{ spacedBy: space.x2 }}
            verticalArrangement={{ spacedBy: space.x2 }}
            modifiers={[fillMaxWidth()]}
          >
            {tags.map((tag, index) => (
              <InputChip
                key={tag}
                enabled={!disabled}
                onClick={() => {
                  if (!disabled) onChange({ kind: 'remove', value: tag });
                }}
                colors={{
                  containerColor: theme.layer.field.fill,
                  labelColor: theme.color.fg,
                  trailingIconColor: theme.color.muted,
                }}
                border={{ color: theme.color.borderField }}
                modifiers={[
                  defaultMinSize({ minHeight: theme.touch }),
                  semantics({ contentDescription: t.botCreation.removeTag(tag) }),
                  testID(`create-bot-tag-${index}`),
                ]}
              >
                <InputChip.Label>
                  <ComposeText>{tag}</ComposeText>
                </InputChip.Label>
                <InputChip.TrailingIcon>
                  <Icon
                    source={require('../../../assets/toolbar/close.png')}
                    size={theme.type.meta.line}
                  />
                </InputChip.TrailingIcon>
              </InputChip>
            ))}
          </FlowRow>
        </Host>
      ) : null}
      <CreationField
        testID="create-bot-tags"
        accessibilityLabel={t.botCreation.tagInput}
        value={value.tagInput ?? ''}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        onChangeText={(text) => {
          if (!disabled) onChange({ kind: 'input', value: text });
        }}
        onSubmitValue={(text) => {
          if (!disabled) onChange({ kind: 'add', value: text });
        }}
      />
      <Text variant="meta" tone="muted">
        {t.botCreation.tagInputHint}
      </Text>
    </View>
  );
}
