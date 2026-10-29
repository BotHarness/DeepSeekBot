import { Pressable, View } from 'react-native';
import {
  creationTags,
  type CreationTagDraft,
  type CreationTagEdit,
} from '../../host/bot-creation-tags';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { CloseIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { CreationField } from './creation-field';
import { Text } from './text';

export interface CreationTagsFieldProps {
  value: CreationTagDraft;
  onChange(action: CreationTagEdit): void;
  disabled: boolean;
}

export function CreationTagsField({ value, onChange, disabled }: CreationTagsFieldProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <View style={{ gap: space.x3 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
        {creationTags(value.tags).map((tag, index) => (
          <Pressable
            key={tag}
            testID={`create-bot-tag-${index}`}
            accessibilityRole="button"
            accessibilityLabel={t.botCreation.removeTag(tag)}
            disabled={disabled}
            onPress={() => onChange({ kind: 'remove', value: tag })}
            style={{
              minHeight: theme.touch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x2,
              paddingHorizontal: space.x3,
              borderRadius: radius.round,
              backgroundColor: theme.layer.field.fill,
            }}
          >
            <Text>{tag}</Text>
            <CloseIcon color={theme.color.muted} size={theme.type.meta.line} />
          </Pressable>
        ))}
      </View>
      <CreationField
        testID="create-bot-tags"
        accessibilityLabel={t.botCreation.tags}
        supportingText={t.botCreation.tagInputHint}
        value={value.tagInput ?? ''}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        returnKeyType="done"
        submitBehavior="submit"
        onChangeText={(text) => onChange({ kind: 'input', value: text })}
        onSubmitEditing={({ nativeEvent }) => onChange({ kind: 'add', value: nativeEvent.text })}
      />
    </View>
  );
}
