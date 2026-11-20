import { useState } from 'react';
import { View } from 'react-native';

import type { AssignmentGroupOption } from '@botharness/host-client/bot-settings';
import type { ModelCatalogGroup } from '@botharness/host-client/model-catalog';
import { ASSIGNMENT_GROUP_NOTE_MAX } from '@botharness/host-client/model-settings';
import { space } from '../design/tokens';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { SheetNote } from './sheet';

function GroupNoteField({
  testID,
  label,
  saved,
  disabled,
  onSave,
}: {
  testID: string;
  label: string;
  saved: string;
  disabled: boolean;
  onSave: (note: string) => void;
}) {
  const [draft, setDraft] = useState(saved);
  const commit = () => {
    if (draft.trim() !== saved.trim()) onSave(draft);
  };
  return (
    <TextField
      testID={testID}
      value={draft}
      onChangeText={setDraft}
      onEndEditing={commit}
      onSubmitEditing={commit}
      editable={!disabled}
      maxLength={ASSIGNMENT_GROUP_NOTE_MAX}
      returnKeyType="done"
      accessibilityLabel={label}
      placeholder={label}
    />
  );
}

export function GroupNotes({
  listed,
  groups,
  options,
  busy,
  onSave,
}: {
  listed: readonly string[];
  groups: readonly ModelCatalogGroup[];
  options: readonly AssignmentGroupOption[];
  busy: boolean;
  onSave: (groupId: string, note: string) => void;
}) {
  const t = useStrings();
  if (listed.length === 0) return null;
  return (
    <View style={{ gap: space.x3, paddingTop: space.x4 }}>
      <SheetNote>{t.modelSettings.groupNotesHint}</SheetNote>
      <View style={{ paddingHorizontal: space.x5, gap: space.x3 }}>
        {listed.map((id) => {
          const name = groups.find((group) => group.id === id)?.name ?? id;
          const saved = options.find((option) => option.group === id)?.note ?? '';
          return (
            <GroupNoteField
              key={`${id}:${saved}`}
              testID={`model-group-note-${id}`}
              label={t.modelSettings.groupNote(name)}
              saved={saved}
              disabled={busy}
              onSave={(note) => onSave(id, note)}
            />
          );
        })}
      </View>
    </View>
  );
}
