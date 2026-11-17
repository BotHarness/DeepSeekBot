import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  importCloudCredential,
  listCloudConnections,
  parseCredentialText,
  type CloudConnectionView,
  type CloudResult,
} from '../host/host-cloud';
import type { HostClient } from '../host/host-settings';
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

export interface CloudConnectionsPort {
  list(): Promise<CloudResult>;
  import(credential: Record<string, unknown>): Promise<CloudResult>;
}

export function cloudConnectionsPort(client: HostClient): CloudConnectionsPort {
  return {
    list: () => listCloudConnections(client),
    import: (credential) => importCloudCredential(client, credential),
  };
}

type LoadState = 'loading' | 'ready' | 'error';
type ImportState = 'idle' | 'saving' | 'saved' | 'invalid' | 'rejected' | 'refused' | 'error';

export function CloudConnectionsView({
  port,
  onClose,
}: {
  port: CloudConnectionsPort;
  onClose(): void;
}) {
  const copy = useStrings().cloudConnections;
  const [load, setLoad] = useState<LoadState>('loading');
  const [connections, setConnections] = useState<CloudConnectionView[]>([]);
  const [editing, setEditing] = useState<CloudConnectionView | undefined>(undefined);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [reason, setReason] = useState<'json' | 'shape' | 'large' | undefined>(undefined);
  const [message, setMessage] = useState('');
  const busy = useRef(false);

  const reload = useCallback(async () => {
    setLoad('loading');
    const result = await port.list();
    if (result.kind === 'ok') {
      setConnections(result.result.connections);
      setLoad('ready');
    } else {
      setLoad('error');
      if (result.kind === 'rejected') setMessage(result.message);
    }
  }, [port]);

  const didInitialLoad = useRef(false);
  if (!didInitialLoad.current) {
    didInitialLoad.current = true;
    void reload();
  }

  const openImport = (target: CloudConnectionView | undefined) => {
    setEditing(target);
    setText('');
    setRevealed(false);
    setImportState('idle');
    setReason(undefined);
    setMessage('');
  };

  const importCredential = async () => {
    if (busy.current) return;
    const parsed = parseCredentialText(text);
    if (parsed.kind === 'invalid') {
      setReason(parsed.reason);
      setImportState('invalid');
      return;
    }
    busy.current = true;
    setImportState('saving');
    setMessage('');
    try {
      const result = await port.import(parsed.credential);
      setText('');
      setRevealed(false);
      if (result.kind === 'ok') {
        setConnections(result.result.connections);
        setLoad('ready');
        setImportState('saved');
      } else if (result.kind === 'rejected') {
        setMessage(result.message);
        setImportState('rejected');
      } else if (result.kind === 'refused') {
        setImportState('refused');
      } else {
        setImportState('error');
      }
    } finally {
      busy.current = false;
    }
  };

  if (editing !== undefined || importState === 'saved') {
    const header = (
      <View style={{ paddingTop: space.x3 }}>
        <DrawerHeader
          title={editing === undefined ? copy.import : copy.switchTo(editing.connection.name)}
          onBack={() => {
            setEditing(undefined);
            setImportState('idle');
          }}
          onClose={onClose}
        />
      </View>
    );
    return (
      <KeyboardFormScroll
        testID="cloud-import-editor"
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.x3, padding: space.x5 }}
      >
        {header}
        <Text variant="meta" tone="muted">
          {copy.importHint}
        </Text>
        <TextField
          testID="cloud-credential"
          label={copy.credential}
          accessibilityLabel={copy.credential}
          multiline
          secureTextEntry={!revealed}
          autoCorrect={false}
          autoCapitalize="none"
          editable={!busy.current}
          value={text}
          placeholder={copy.credentialPlaceholder}
          invalid={importState === 'invalid'}
          {...(importState === 'invalid' && reason !== undefined
            ? { supportingText: copy.invalid(reason) }
            : {})}
          onChangeText={(value) => {
            setText(value);
            setImportState('idle');
            setReason(undefined);
            setMessage('');
          }}
        />
        <Button
          label={revealed ? copy.hide : copy.reveal}
          testID="cloud-credential-reveal"
          onPress={() => setRevealed((shown) => !shown)}
        />
        {importState === 'rejected' ? (
          <Text accessibilityRole="alert" tone="danger">
            {message === '' ? copy.rejected : message}
          </Text>
        ) : null}
        {importState === 'refused' ? (
          <Text accessibilityRole="alert" tone="danger">
            {copy.refused}
          </Text>
        ) : null}
        {importState === 'error' ? (
          <Text accessibilityRole="alert" tone="danger">
            {copy.saveFailed}
          </Text>
        ) : null}
        {importState === 'saved' ? <Text tone="muted">{copy.imported}</Text> : null}
        <Button
          label={copy.import}
          testID="cloud-import-save"
          busy={importState === 'saving'}
          disabled={importState === 'saving' || text.length === 0}
          onPress={() => void importCredential()}
        />
      </KeyboardFormScroll>
    );
  }

  const header = (
    <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}>
      <DrawerHeader title={copy.title} onBack={onClose} onClose={onClose} />
    </View>
  );
  return (
    <SettingsForm testID="cloud-connections-list" header={header}>
      <SettingsSection title={copy.title} on={SHEET_GROUP}>
        {load === 'loading' ? <SettingsRow title={copy.loading} on={SHEET_GROUP} /> : null}
        {connections.map((entry) => (
          <SettingsRow
            key={entry.connection.id}
            title={entry.connection.name}
            detail={`${entry.connection.organizationId} · ${
              entry.active ? copy.active : copy.inactive
            }`}
            on={SHEET_GROUP}
            disclosure
            testID={`cloud-connection-${entry.connection.id}`}
            onPress={() => openImport(entry)}
          />
        ))}
        {load === 'ready' && connections.length === 0 ? (
          <SettingsRow title={copy.empty} on={SHEET_GROUP} />
        ) : null}
      </SettingsSection>
      {load === 'error' ? (
        <View style={{ gap: space.x2 }}>
          <Text accessibilityRole="alert" tone="danger">
            {message === '' ? copy.loadFailed : message}
          </Text>
          <Button
            label={copy.reload}
            testID="cloud-connections-retry"
            onPress={() => void reload()}
          />
        </View>
      ) : null}
      <Button
        label={copy.import}
        testID="cloud-connections-add"
        onPress={() => openImport(undefined)}
      />
    </SettingsForm>
  );
}
