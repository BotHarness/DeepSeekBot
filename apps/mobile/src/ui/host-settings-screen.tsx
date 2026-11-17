import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  omitSecretPaths,
  type SettingsDescribe,
  type SettingsNamespace,
  type SettingsSaveResult,
} from '../host/host-settings';
import { SHEET_GROUP } from './chat/sheet';
import { space } from './design/tokens';
import { Button } from './primitives/button';
import { DrawerHeader } from './primitives/drawer-header';
import { KeyboardFormScroll } from './primitives/keyboard-form';
import { SettingsForm } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { TextField } from './primitives/text-field';
import { useStrings } from './strings';

export interface HostSettingsPort {
  describe(): Promise<SettingsDescribe>;
  save(ns: string, patch: Record<string, unknown>, revision: number): Promise<SettingsSaveResult>;
}

type Load =
  | { status: 'loading' }
  | { status: 'ready'; describe: SettingsDescribe }
  | { status: 'error' };
type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'rejected' | 'refused' | 'error';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function HostSettingsView({ port, onClose }: { port: HostSettingsPort; onClose(): void }) {
  const copy = useStrings().hostSettings;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [parseError, setParseError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState<{ expected: number; actual: number } | undefined>(
    undefined,
  );
  const saving = useRef(false);

  const reload = useCallback(async (): Promise<SettingsDescribe | undefined> => {
    setLoad({ status: 'loading' });
    try {
      const describe = await port.describe();
      setLoad({ status: 'ready', describe });
      return describe;
    } catch {
      setLoad({ status: 'error' });
      return undefined;
    }
  }, [port]);

  const didInitialLoad = useRef(false);
  if (!didInitialLoad.current) {
    didInitialLoad.current = true;
    void reload();
  }

  const namespace =
    load.status === 'ready' && selected !== undefined
      ? load.describe.namespaces.find((entry) => entry.ns === selected)
      : undefined;

  const resetEditor = () => {
    setSelected(undefined);
    setDraft('');
    setParseError(false);
    setSaveState('idle');
    setMessage('');
    setConflict(undefined);
  };

  const openEditor = (entry: SettingsNamespace) => {
    setSelected(entry.ns);
    setDraft(JSON.stringify(omitSecretPaths(entry.value, entry.secrets), null, 2));
    setParseError(false);
    setSaveState('idle');
    setMessage('');
    setConflict(undefined);
  };

  const save = async () => {
    if (namespace === undefined || saving.current) return;
    let patch: unknown;
    try {
      patch = JSON.parse(draft);
    } catch {
      setParseError(true);
      setSaveState('error');
      return;
    }
    if (!isObject(patch)) {
      setParseError(true);
      setSaveState('error');
      return;
    }
    saving.current = true;
    setSaveState('saving');
    try {
      const result = await port.save(namespace.ns, patch, namespace.revision);
      if (result.kind === 'saved') {
        setSaveState('saved');
        const written = result.namespace;
        setLoad((previous) =>
          previous.status === 'ready'
            ? {
                status: 'ready',
                describe: {
                  ...previous.describe,
                  namespaces: previous.describe.namespaces.map((entry) =>
                    entry.ns === written.ns ? written : entry,
                  ),
                },
              }
            : previous,
        );
        setDraft(JSON.stringify(omitSecretPaths(written.value, written.secrets), null, 2));
      } else if (result.kind === 'conflict') {
        setConflict({ expected: result.expected, actual: result.actual });
        setSaveState('conflict');
      } else if (result.kind === 'rejected') {
        setMessage(result.message);
        setSaveState('rejected');
      } else if (result.kind === 'refused') {
        setSaveState('refused');
      } else {
        setSaveState('error');
      }
    } finally {
      saving.current = false;
    }
  };

  const reloadAfterConflict = async () => {
    const describe = await port.describe().catch(() => undefined);
    if (describe !== undefined) {
      setLoad({ status: 'ready', describe });
      setDraft('');
    }
    setSelected(undefined);
    setSaveState('idle');
    setConflict(undefined);
    setMessage('');
  };

  const header = (
    <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}>
      <DrawerHeader
        title={namespace === undefined ? copy.title : namespace.ns}
        onBack={namespace === undefined ? onClose : resetEditor}
        {...(namespace === undefined ? { onClose } : {})}
      />
    </View>
  );

  if (namespace !== undefined) {
    const canWrite = namespace.writable !== false;
    const secretCount = namespace.secrets?.length ?? 0;
    return (
      <KeyboardFormScroll
        testID="host-settings-editor"
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.x3, padding: space.x5 }}
      >
        {header}
        <Text variant="meta" tone="muted">
          {copy.revision(namespace.revision)}
        </Text>
        {secretCount > 0 ? (
          <Text variant="meta" tone="muted">
            {copy.secretsHint(secretCount)}
          </Text>
        ) : null}
        <TextField
          testID="host-settings-draft"
          label={copy.valueLabel}
          accessibilityLabel={copy.valueLabel}
          multiline
          autoCorrect={false}
          autoCapitalize="none"
          editable={canWrite && saveState !== 'saving'}
          value={draft}
          invalid={parseError}
          {...(parseError ? { supportingText: copy.invalidJson } : {})}
          onChangeText={(value) => {
            setDraft(value);
            setParseError(false);
            setSaveState('idle');
            setConflict(undefined);
            setMessage('');
          }}
        />
        {saveState === 'conflict' && conflict !== undefined ? (
          <View style={{ gap: space.x2 }}>
            <Text accessibilityRole="alert" tone="danger">
              {copy.conflict(conflict.expected, conflict.actual)}
            </Text>
            <Button
              label={copy.reload}
              testID="host-settings-reload"
              onPress={() => void reloadAfterConflict()}
            />
          </View>
        ) : null}
        {saveState === 'rejected' ? (
          <Text accessibilityRole="alert" tone="danger">
            {message === '' ? copy.rejected : message}
          </Text>
        ) : null}
        {saveState === 'refused' ? (
          <Text accessibilityRole="alert" tone="danger">
            {copy.refused}
          </Text>
        ) : null}
        {saveState === 'error' && !parseError ? (
          <Text accessibilityRole="alert" tone="danger">
            {copy.saveFailed}
          </Text>
        ) : null}
        {saveState === 'saved' ? <Text tone="muted">{copy.saved}</Text> : null}
        {canWrite ? (
          <Button
            label={copy.save}
            testID="host-settings-save"
            busy={saveState === 'saving'}
            disabled={saveState === 'saving' || parseError}
            onPress={() => void save()}
          />
        ) : (
          <Text variant="meta" tone="muted">
            {copy.readOnly}
          </Text>
        )}
      </KeyboardFormScroll>
    );
  }

  const namespaces = load.status === 'ready' ? load.describe.namespaces : [];
  return (
    <SettingsForm testID="host-settings-list" header={header}>
      <SettingsSection title={copy.title} on={SHEET_GROUP}>
        {load.status === 'loading' ? <SettingsRow title={copy.loading} on={SHEET_GROUP} /> : null}
        {namespaces.map((entry) => (
          <SettingsRow
            key={entry.ns}
            title={entry.ns}
            detail={copy.revision(entry.revision)}
            on={SHEET_GROUP}
            disclosure
            testID={`host-settings-ns-${entry.ns}`}
            onPress={() => openEditor(entry)}
          />
        ))}
      </SettingsSection>
      {load.status === 'error' ? (
        <View style={{ gap: space.x2 }}>
          <Text accessibilityRole="alert" tone="danger">
            {copy.loadFailed}
          </Text>
          <Button label={copy.reload} testID="host-settings-retry" onPress={() => void reload()} />
        </View>
      ) : null}
      {load.status === 'ready' && namespaces.length === 0 ? (
        <Text tone="muted">{copy.empty}</Text>
      ) : null}
    </SettingsForm>
  );
}
