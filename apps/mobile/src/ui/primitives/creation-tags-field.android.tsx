import { FlowRow, Host, Icon, InputChip, Text } from '@expo/ui/jetpack-compose';
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

export function CreationTagsField({ value, onChange, disabled }: CreationTagsFieldProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  return (
    <View style={{ gap: space.x3 }}>
      <Host
        matchContents={{ vertical: true }}
        ignoreSafeAreaKeyboardInsets
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        style={{ width: '100%' }}
      >
        <FlowRow
          horizontalArrangement={{ spacedBy: space.x2 }}
          verticalArrangement={{ spacedBy: space.x2 }}
          modifiers={[fillMaxWidth()]}
        >
          {creationTags(value.tags).map((tag, index) => (
            <InputChip
              key={tag}
              enabled={!disabled}
              onClick={() => onChange({ kind: 'remove', value: tag })}
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
                <Text>{tag}</Text>
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
      <CreationField
        testID="create-bot-tags"
        accessibilityLabel={t.botCreation.tags}
        supportingText={t.botCreation.tagInputHint}
        value={value.tagInput ?? ''}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        returnKeyType="send"
        submitBehavior="submit"
        onChangeText={(text) => onChange({ kind: 'input', value: text })}
        onSubmitEditing={({ nativeEvent }) => onChange({ kind: 'add', value: nativeEvent.text })}
      />
    </View>
  );
}
