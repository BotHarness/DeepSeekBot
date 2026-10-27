import type { CreationTagDraft, CreationTagEdit } from '../../host/bot-creation-tags';
import { useStrings } from '../strings';
import { CreationField } from './creation-field';

export interface CreationTagsFieldProps {
  value: CreationTagDraft;
  onChange(action: CreationTagEdit): void;
  disabled: boolean;
}

export function CreationTagsField({ value, onChange, disabled }: CreationTagsFieldProps) {
  const t = useStrings();
  return (
    <CreationField
      testID="create-bot-tags"
      accessibilityLabel={t.botCreation.tags}
      value={value.tags}
      onChangeText={(text) => onChange({ kind: 'replace', value: text })}
      editable={!disabled}
    />
  );
}
