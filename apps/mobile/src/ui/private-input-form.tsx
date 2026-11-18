import { useRef, useState } from 'react';
import { AppState, View, type ViewInstance } from 'react-native';
import type { HostClient } from '@botharness/host-client/client';
import { loadPrivateInput } from '../host/private-input';
import type { RequestRef } from '@botharness/host-client/requests';
import { useMounted } from './mounted';
import { space } from './design/tokens';
import { Button } from './primitives/button';
import { KeyboardFormScroll } from './primitives/keyboard-form';
import { TextField } from './primitives/text-field';
import { labelInField } from './primitives/field-label';
import { Text } from './primitives/text';
import { useStrings } from './strings';

type Request = Awaited<ReturnType<typeof loadPrivateInput>>;
const PRIVATE_INPUT_RESOURCE = 'private-inputs';
const PRIVATE_INPUT_SAFETY_MS = 15_000;
export function PrivateInputForm({
  client,
  target,
  after,
}: {
  client: HostClient;
  target: RequestRef;
  after?(): void;
}) {
  const t = useStrings();
  const [request, setRequest] = useState<Request>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'refresh' | 'save'>();
  const terminal = useRef(false);
  const [retry, setRetry] = useState(0);
  const active = useRef(false),
    submitting = useRef(false);
  const mount = useMounted<ViewInstance>(() => {
    active.current = true;
    terminal.current = false;
    let cancelled = false;
    let settled = false;
    let reading = false;
    let again = false;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const read = async (): Promise<void> => {
      if (cancelled || settled || terminal.current) return;
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      try {
        const next = await loadPrivateInput(client, target);
        if (cancelled || terminal.current) return;
        setError(undefined);
        setRequest(next);
        if (next.status !== 'pending') {
          settled = true;
          setValues({});
        }
      } catch {
        if (!cancelled && !terminal.current) setError('refresh');
      } finally {
        reading = false;
        if (again && !cancelled && !settled) {
          again = false;
          void read();
        }
      }
    };
    const invalidate = (): void => {
      if (cancelled || settled || terminal.current || pending !== undefined) return;
      pending = setTimeout(() => {
        pending = undefined;
        void read();
      }, 25);
    };
    const offResource = client.onResource?.((resource) => {
      if (resource === undefined || resource === PRIVATE_INPUT_RESOURCE) invalidate();
    });
    const offApp = AppState.addEventListener('change', (state) => {
      if (state === 'active') invalidate();
    });
    const safety = setInterval(invalidate, PRIVATE_INPUT_SAFETY_MS);
    void read();
    return () => {
      cancelled = true;
      active.current = false;
      clearTimeout(pending);
      clearInterval(safety);
      offResource?.();
      offApp.remove();
    };
  }, [client, target.channelId, target.messageId, retry]);
  const submit = async (cancel: boolean) => {
    if (submitting.current || request?.status !== 'pending') return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.call<{ accepted: boolean }>(
        cancel ? 'privateInputCancel' : 'privateInputSubmit',
        {
          channelId: target.channelId,
          messageId: target.messageId,
          ...(cancel ? {} : { values }),
        },
      );
      if (!active.current) return;
      if (result.accepted) {
        terminal.current = true;
        setValues({});
        setRequest({ ...request, status: cancel ? 'cancelled' : 'configured' });
        after?.();
        return;
      }
      const next = await loadPrivateInput(client, target);
      if (!active.current) return;
      setRequest(next);
      if (result.accepted || next.status !== 'pending') {
        setValues({});
        after?.();
      } else setError('save');
    } catch {
      if (active.current) setError('save');
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
                    {labelInField ? null : (
                      <Text>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </Text>
                    )}
                    <TextField
                      testID={`private-input-${field.id}`}
                      accessibilityLabel={field.label}
                      label={field.required ? `${field.label} *` : field.label}
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
            <Text tone="danger">
              {error === 'refresh' ? t.privateInputRefreshError : t.privateInputError}
            </Text>
            {error === 'refresh' ? (
              <Button
                label={t.retry}
                onPress={() => {
                  setError(undefined);
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
