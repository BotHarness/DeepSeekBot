import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  describeCredentials,
  setCredential,
  unsetCredential,
  validCredentialRef,
  type CredentialInfo,
  type CredentialWriteResult,
} from '../host/host-credentials';
import type { HostClient } from '../host/host-settings';
import { space } from './design/tokens';
import { confirmDestructive } from './primitives/app-dialog';
import { Button } from './primitives/button';
import { DrawerHeader } from './primitives/drawer-header';
import { KeyboardFormScroll } from './primitives/keyboard-form';
import { Text } from './primitives/text';
import { TextField } from './primitives/text-field';
import { useStrings } from './strings';

export interface CredentialsPort {
  describe(refs: string[]): Promise<Record<string, CredentialInfo>>;
  set(ref: string, value: string): Promise<CredentialWriteResult>;
  unset(ref: string): Promise<CredentialWriteResult>;
}

type WriteState = 'idle' | 'saving' | 'saved' | 'removed' | 'rejected' | 'refused' | 'error';

export function credentialsPort(client: HostClient): CredentialsPort {
  return {
    describe: (refs) => describeCredentials(client, refs),
    set: (ref, value) => setCredential(client, ref, value),
    unset: (ref) => unsetCredential(client, ref),
  };
}

export function CredentialsView({ port, onClose }: { port: CredentialsPort; onClose(): void }) {
  const copy = useStrings().credentials;
  const [ref, setRef] = useState('');
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [info, setInfo] = useState<CredentialInfo | undefined>(undefined);
  const [state, setState] = useState<WriteState>('idle');
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const refValid = validCredentialRef(ref);

  const refresh = useCallback(async () => {
    if (!refValid) {
      setInfo(undefined);
      return;
    }
    try {
      const described = await port.describe([ref]);
      setInfo(described[ref]);
    } catch {
      setInfo(undefined);
    }
  }, [port, ref, refValid]);

  const didInitialLoad = useRef(false);
  if (!didInitialLoad.current) {
    didInitialLoad.current = true;
    void refresh();
  }

  const save = async () => {
    if (!refValid || value.length === 0 || busy.current) return;
    busy.current = true;
    setState('saving');
    setMessage('');
    try {
      const result = await port.set(ref, value);
      setValue('');
      setRevealed(false);
      if (result.kind === 'saved') {
        setState('saved');
        await refresh();
      } else if (result.kind === 'rejected') {
        setMessage(result.message);
        setState('rejected');
      } else if (result.kind === 'refused') {
        setState('refused');
      } else {
        setState('error');
      }
    } finally {
      busy.current = false;
    }
  };

  const performRemove = async () => {
    busy.current = true;
    setState('saving');
    setMessage('');
    try {
      const result = await port.unset(ref);
      if (result.kind === 'removed') {
        setState('removed');
        await refresh();
      } else if (result.kind === 'rejected') {
        setMessage(result.message);
        setState('rejected');
      } else if (result.kind === 'refused') {
        setState('refused');
      } else {
        setState('error');
      }
    } finally {
      busy.current = false;
    }
  };

  const remove = () => {
    if (!refValid || busy.current) return;
    confirmDestructive(copy.removeTitle, copy.removeBody, copy.remove, () => {
      void performRemove();
    });
  };

  return (
    <KeyboardFormScroll
      testID="credentials-editor"
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: space.x3, padding: space.x5 }}
    >
      <View style={{ paddingTop: space.x3 }}>
        <DrawerHeader title={copy.title} onBack={onClose} onClose={onClose} />
      </View>
      <Text variant="meta" tone="muted">
        {copy.hint}
      </Text>
      <TextField
        testID="credentials-ref"
        label={copy.ref}
        accessibilityLabel={copy.ref}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy.current}
        value={ref}
        invalid={ref.length > 0 && !refValid}
        {...(ref.length > 0 && !refValid ? { supportingText: copy.refInvalid } : {})}
        onChangeText={(value) => {
          setRef(value);
          setInfo(undefined);
          setState('idle');
          setMessage('');
        }}
      />
      <TextField
        testID="credentials-value"
        label={copy.value}
        accessibilityLabel={copy.value}
        secureTextEntry={!revealed}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy.current}
        value={value}
        placeholder={copy.valuePlaceholder}
        onChangeText={(value) => {
          setValue(value);
          setState('idle');
          setMessage('');
        }}
      />
      <Button
        label={revealed ? copy.hide : copy.reveal}
        testID="credentials-reveal"
        onPress={() => setRevealed((shown) => !shown)}
      />
      {info === undefined ? null : (
        <View style={{ gap: space.x1 }}>
          <Text variant="meta" tone="muted">
            {info.configured ? copy.configured : copy.notConfigured}
          </Text>
          {info.source === undefined ? null : (
            <Text variant="meta" tone="muted">
              {copy.source(info.source)}
            </Text>
          )}
          {info.masked === undefined ? null : (
            <Text variant="meta" tone="muted">
              {copy.masked(info.masked)}
            </Text>
          )}
        </View>
      )}
      {state === 'saved' ? <Text tone="muted">{copy.saved}</Text> : null}
      {state === 'removed' ? <Text tone="muted">{copy.removed}</Text> : null}
      {state === 'rejected' ? (
        <Text accessibilityRole="alert" tone="danger">
          {message === '' ? copy.rejected : message}
        </Text>
      ) : null}
      {state === 'refused' ? (
        <Text accessibilityRole="alert" tone="danger">
          {copy.refused}
        </Text>
      ) : null}
      {state === 'error' ? (
        <Text accessibilityRole="alert" tone="danger">
          {copy.saveFailed}
        </Text>
      ) : null}
      <Button
        label={copy.save}
        testID="credentials-save"
        busy={state === 'saving'}
        disabled={state === 'saving' || !refValid || value.length === 0}
        onPress={() => void save()}
      />
      <Button
        label={copy.remove}
        testID="credentials-remove"
        tone="danger"
        disabled={state === 'saving' || !refValid}
        onPress={remove}
      />
    </KeyboardFormScroll>
  );
}
