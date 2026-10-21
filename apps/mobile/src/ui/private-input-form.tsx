import { useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';
import type { HostClient } from '../host/client';
import { loadPrivateInput } from '../host/private-input';
import type { RequestRef } from '../host/requests';
import { useMounted } from './mounted';
import { space } from './design/tokens';
import { Button } from './primitives/button';
import { KeyboardFormScroll } from './primitives/keyboard-form';
import { TextField } from './primitives/text-field';
import { Text } from './primitives/text';
import { t } from './strings';

type Request = Awaited<ReturnType<typeof loadPrivateInput>>;
export function PrivateInputForm({
  client,
  target,
  after,
}: {
  client: HostClient;
  target: RequestRef;
  after?(): void;
}) {
  const [request, setRequest] = useState<Request>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const active = useRef(false),
    submitting = useRef(false);
  const mount = useMounted<ViewInstance>(() => {
    active.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await loadPrivateInput(client, target);
        if (cancelled) return;
        setRequest(next);
        if (next.status !== 'pending') setValues({});
        else timer = setTimeout(() => void poll(), 2500);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      active.current = false;
      clearTimeout(timer);
    };
  }, [client, target.channelId, target.messageId, retry]);
  const submit = async (cancel: boolean) => {
    if (submitting.current || request?.status !== 'pending') return;
    submitting.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await client.call<{ accepted: boolean }>(
        cancel ? 'privateInputCancel' : 'privateInputSubmit',
        {
          channelId: target.channelId,
          messageId: target.messageId,
          ...(cancel ? {} : { values }),
        },
      );
      const next = await loadPrivateInput(client, target);
      if (!active.current) return;
      setRequest(next);
      if (result.accepted || next.status !== 'pending') {
        setValues({});
        after?.();
      } else setError(true);
    } catch {
      if (active.current) setError(true);
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  };
  const allowed = client.secretInputAllowed?.() !== false;
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <KeyboardFormScroll
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
      >
        {request === undefined ? (
          <Text>{error ? t.privateInputEmpty : t.loading}</Text>
        ) : request.status !== 'pending' ? (
          <Text>{t.privateInputDone}</Text>
        ) : (
          <>
            <Text strong>{request.account}</Text>
            <Text>{request.purpose}</Text>
            <Text variant="meta" tone="muted">
              {allowed ? t.privateInputSecureNote : t.pairRefused['host-key-required']}
            </Text>
            {allowed
              ? request.fields.map((field) => (
                  <View key={field.id} style={{ gap: space.x2 }}>
                    <Text>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </Text>
                    <TextField
                      testID={`private-input-${field.id}`}
                      accessibilityLabel={field.label}
                      secureTextEntry
                      autoComplete="off"
                      textContentType="none"
                      autoCorrect={false}
                      autoCapitalize="none"
                      maxLength={16384}
                      value={values[field.id] ?? ''}
                      onChangeText={(value) =>
                        setValues((previous) => ({ ...previous, [field.id]: value }))
                      }
                      editable={!busy}
                    />
                  </View>
                ))
              : null}
            <Button
              testID="private-input-submit"
              label={t.privateInputSubmit}
              tone="primary"
              busy={busy}
              disabled={
                !allowed || request.fields.some((field) => field.required && !values[field.id])
              }
              onPress={() => void submit(false)}
            />
            <Button
              testID="private-input-cancel"
              label={t.cancel}
              disabled={busy}
              onPress={() => void submit(true)}
            />
          </>
        )}
        {error ? (
          <>
            <Text tone="danger">{t.privateInputError}</Text>
            {request === undefined ? (
              <Button
                label={t.retry}
                onPress={() => {
                  setError(false);
                  setRetry((value) => value + 1);
                }}
              />
            ) : null}
          </>
        ) : null}
      </KeyboardFormScroll>
    </View>
  );
}
