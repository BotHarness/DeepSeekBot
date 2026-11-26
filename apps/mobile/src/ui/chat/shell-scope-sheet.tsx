import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import type { ShellPrefixApproval } from '@botharness/host-protocol/wire';
import { customShellRule } from '@botharness/host-client/shared/shell-approval-scope';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Text } from '../primitives/text';
import { TextField, type TextFieldHandle } from '../primitives/text-field';
import { errorText } from '../request-parts';
import { useStrings } from '../strings';
import { Sheet, SheetActions } from './sheet';
import {
  shellScopeErrorText,
  shellScopeProblemText,
  type CustomShellScope,
} from './shell-scope-actions';

export function ShellScopeSheet({
  choice,
  onSave,
  onClose,
}: {
  choice: CustomShellScope;
  onSave(rule: ShellPrefixApproval): Promise<boolean>;
  onClose(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const copy = t.shellScope;
  const [drafts, setDrafts] = useState(choice.drafts);
  const [problem, setProblem] = useState<{ index: number; text: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const firstField = useRef<TextFieldHandle>(null);
  const initialFocusScheduled = useRef(false);
  function focusOnLayout() {
    if (initialFocusScheduled.current) return;
    initialFocusScheduled.current = true;
    requestAnimationFrame(() => firstField.current?.focus());
  }
  const compound = drafts.length > 1;
  const save = async () => {
    if (pending.current) return;
    const result = customShellRule(drafts);
    if (!result.ok) {
      setProblem({ index: result.index, text: shellScopeProblemText(result.problem) });
      return;
    }
    pending.current = true;
    setBusy(true);
    setProblem(undefined);
    setError(undefined);
    try {
      if (await onSave(result.rule)) onClose();
    } catch (failure) {
      setError(shellScopeErrorText(failure) ?? `${t.decideFailed} ${errorText(failure)}`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible
      label={copy.customTitle}
      title={copy.customTitle}
      onClose={() => {
        if (!pending.current) onClose();
      }}
      avoidKeyboard
    >
      <KeyboardFormScroll enabled={false} nestedScrollEnabled>
        <View style={{ paddingHorizontal: space.x5, gap: space.x3 }}>
          {drafts.map((draft, index) => (
            <View
              key={index}
              style={{ gap: space.x2 }}
              onLayout={Platform.OS === 'android' && index === 0 ? focusOnLayout : undefined}
            >
              {compound ? (
                <Text
                  variant="meta"
                  tone="muted"
                  numberOfLines={2}
                  style={{ fontFamily: theme.mono }}
                >
                  {choice.commands[index] ?? ''}
                </Text>
              ) : null}
              <TextField
                ref={index === 0 ? firstField : null}
                testID={`shell-scope-prefix-${index}`}
                accessibilityLabel={compound ? choice.commands[index] : copy.customLabel}
                value={draft}
                onChangeText={(value) => {
                  setDrafts((current) => current.map((item, at) => (at === index ? value : item)));
                  if (problem?.index === index) setProblem(undefined);
                  setError(undefined);
                }}
                editable={!busy}
                invalid={problem?.index === index}
                {...(problem?.index === index ? { supportingText: problem.text } : {})}
                autoFocus={Platform.OS !== 'android' && index === 0}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="done"
                onSubmitEditing={() => void save()}
              />
            </View>
          ))}
          <Text variant="meta" tone="muted">
            {copy.customHint}
          </Text>
          {problem === undefined ? null : (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
              {problem.text}
            </Text>
          )}
          {error === undefined ? null : (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
              {error}
            </Text>
          )}
        </View>
        <SheetActions>
          <Button label={t.cancel} disabled={busy} on="sheet" onPress={onClose} />
          <Button
            testID="shell-scope-save"
            label={copy.save}
            busy={busy}
            tone="primary"
            on="sheet"
            onPress={() => void save()}
          />
        </SheetActions>
      </KeyboardFormScroll>
    </Sheet>
  );
}
