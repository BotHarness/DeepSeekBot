import { Host } from '@expo/ui';
import { Toggle } from '@expo/ui/swift-ui';
import { accessibilityIdentifier, disabled } from '@expo/ui/swift-ui/modifiers';
import { isLanRoute } from '@botharness/host-protocol/route';
import type { HostApiAnswer, HostApiInit } from '@botharness/host-client/client';
import { requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, ScrollView } from 'react-native';
import {
  COMPUTER_UNLOCK_PATH,
  COMPUTER_UNLOCK_TIMEOUT_MS,
  parseComputerUnlockReply,
  type ComputerUnlockCode,
  type ComputerUnlockCommand,
  type ComputerUnlockOperation,
} from '../../../../../packages/computer/src/unlock-contract';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { SheetFrame } from './sheet-frame';

interface NativeUnlock {
  saved(host: string, device: string): Promise<boolean>;
  disable(host: string, device: string): Promise<void>;
  prepare(
    host: string,
    device: string,
    operation: ComputerUnlockOperation,
    offer: string,
    saved: boolean,
    copy: string,
  ): Promise<{ code: ComputerUnlockCode; packet?: string; request?: string }>;
  finish(request: string, receipt: string): Promise<ComputerUnlockCode>;
  cancel(): Promise<void>;
}

const native = requireOptionalNativeModule<NativeUnlock>('ComputerUnlock');

export function useComputerUnlock({
  api,
  host,
  device,
  route,
  onUnlocked,
}: {
  api?: (path: string, init: HostApiInit) => Promise<HostApiAnswer>;
  host?: string;
  device?: string;
  route: string;
  onUnlocked(): void;
}) {
  const t = useStrings();
  const [status, setStatus] = useState<{ code: ComputerUnlockCode; locked?: boolean }>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ComputerUnlockCode>();
  const [security, setSecurity] = useState(false);
  const [focus, setFocus] = useState<AbortController>();
  const lastAutomatic = useRef<AbortController | undefined>(undefined);
  const pending = useRef(false);
  const enabled = native !== null && !!host && !!device && isLanRoute(route) && api !== undefined;

  const send = useCallback(
    async (command: ComputerUnlockCommand, signal: AbortSignal) => {
      if (!api || signal.aborted) return { code: 'cancelled' } as const;
      const result = await api(COMPUTER_UNLOCK_PATH, {
        body: command,
        timeoutMs: COMPUTER_UNLOCK_TIMEOUT_MS + 1000,
        signal,
      });
      return parseComputerUnlockReply(result.body);
    },
    [api],
  );

  const run = useCallback(
    async (operation: ComputerUnlockOperation | 'disable', useSaved: boolean) => {
      const active = focus;
      if (
        !active ||
        active.signal.aborted ||
        !native ||
        !host ||
        !device ||
        pending.current ||
        AppState.currentState !== 'active'
      )
        return;
      pending.current = true;
      setBusy(true);
      setMessage(undefined);
      let result: ComputerUnlockCode = 'unavailable';
      try {
        if (operation === 'disable') {
          await native.disable(host, device);
          result = 'ok';
        } else {
          const offer = await send({ kind: 'begin', operation }, active.signal);
          result = offer.code;
          if (!active.signal.aborted && offer.code === 'ready' && offer.offer) {
            const prepared = await native.prepare(
              host,
              device,
              operation,
              offer.offer,
              useSaved,
              JSON.stringify({
                title: t.computerUnlockPassword,
                field: t.computerUnlockPassword,
                submit: operation === 'verify' ? t.computerUnlockSave : t.computerUnlockAction,
                cancel: t.cancel,
                faceID: operation === 'verify' ? t.computerUnlockProtect : t.computerUnlockFaceID,
              }),
            );
            result = prepared.code;
            if (!active.signal.aborted && prepared.packet && prepared.request) {
              const reply = await send(
                { kind: 'finish', operation, packet: prepared.packet },
                active.signal,
              );
              result =
                reply.code === 'ok' && reply.receipt
                  ? await native.finish(prepared.request, reply.receipt)
                  : reply.code === 'ok'
                    ? 'invalid'
                    : reply.code;
            }
          }
        }
        if (active.signal.aborted) return;
        if (result === 'ok') {
          if (operation === 'verify' || operation === 'disable') setSaved(operation === 'verify');
          if (operation === 'unlock') {
            setStatus({ code: 'ready', locked: false });
            onUnlocked();
          }
        } else if (result !== 'cancelled') {
          setMessage(result);
        }
      } catch {
        if (!active.signal.aborted) setMessage('unavailable');
      } finally {
        await native.cancel().catch(() => undefined);
        pending.current = false;
        setBusy(false);
      }
    },
    [device, focus, host, onUnlocked, send, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!native || !host || !device) return;
      const module = native;
      let active = new AbortController();
      setFocus(active);
      setSaved(false);
      setStatus(undefined);
      setMessage(undefined);
      setSecurity(false);
      lastAutomatic.current = undefined;
      const subscription = AppState.addEventListener('change', (next) => {
        if (next === 'background') {
          active.abort();
          void module.cancel().catch(() => undefined);
        }
        if (next === 'active' && active.signal.aborted) {
          active = new AbortController();
          lastAutomatic.current = active;
          setFocus(active);
        }
      });
      return () => {
        active.abort();
        subscription.remove();
        void module.cancel().catch(() => undefined);
      };
    }, [device, host]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!native || !host || !device || !focus || focus.signal.aborted) return;
      const active = focus;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      active.signal.addEventListener('abort', cancel, { once: true });
      const { signal } = controller;
      const refresh = async () => {
        const [passwordSaved, latest] = await Promise.all([
          native.saved(host, device).catch(() => false),
          enabled ? send({ kind: 'status' }, signal).catch(() => undefined) : undefined,
        ]);
        if (signal.aborted) return;
        setSaved(passwordSaved);
        setStatus(latest);
        if (latest?.code !== 'ready' || lastAutomatic.current === active) return;
        lastAutomatic.current = active;
        if (latest.locked && passwordSaved) await run('unlock', true);
      };
      void refresh().catch(() => undefined);
      return () => {
        active.signal.removeEventListener('abort', cancel);
        cancel();
      };
    }, [device, enabled, focus, host, run, send]),
  );

  const openSecurity = () => {
    setSecurity(true);
    const active = focus;
    if (!active || !enabled) return;
    void send({ kind: 'status' }, active.signal).then(
      (latest) => {
        if (!active.signal.aborted) setStatus(latest);
      },
      () => {
        if (!active.signal.aborted) setStatus({ code: 'unavailable' });
      },
    );
  };

  return {
    busy,
    saved,
    locked: status?.locked === true,
    setupAllowed: status?.code === 'ready' && status.locked === false,
    unlockAllowed: status?.code === 'ready' && status.locked === true,
    message: message ?? (status?.code === 'accessibility-required' ? status.code : undefined),
    securityAction:
      (enabled && (status?.code === 'ready' || status?.code === 'accessibility-required')) || saved
        ? openSecurity
        : undefined,
    security,
    closeSecurity: () => setSecurity(false),
    enable: () => run('verify', false),
    disable: () => run('disable', false),
    manual: () => run('unlock', false),
  };
}

export function computerUnlockMessage(t: ReturnType<typeof useStrings>, code?: ComputerUnlockCode) {
  if (!code) return undefined;
  switch (code) {
    case 'key-changed':
      return t.computerUnlockKeyChanged;
    case 'password-rejected':
      return t.computerUnlockRejected;
    case 'password-missing':
      return t.computerUnlockMissing;
    case 'face-id-required':
      return t.computerUnlockNeedsFaceID;
    case 'accessibility-required':
      return t.computerUnlockAccessibility;
    case 'limited':
      return t.computerUnlockLimited;
    case 'unlock-unavailable':
      return t.computerUnlockUnrecognized;
    case 'ready':
    case 'ok':
    case 'cancelled':
      return undefined;
    case 'unavailable':
    case 'invalid':
    case 'expired':
    case 'busy':
    case 'invalid-identity':
    case 'invalid-message':
      return t.computerUnlockUnavailable;
  }
}

export function ComputerSecurity({ unlock }: { unlock: ReturnType<typeof useComputerUnlock> }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const message = computerUnlockMessage(t, unlock.message);
  return (
    <SheetFrame
      visible={unlock.security}
      label={t.computerSecurity}
      onClose={unlock.closeSecurity}
      avoidKeyboard={false}
      animationType="slide"
    >
      <ScrollView contentContainerStyle={{ gap: space.x4, paddingHorizontal: space.x6 }}>
        <Text variant="title">{t.computerSecurity}</Text>
        <Host colorScheme={theme.scheme} matchContents={{ vertical: true }}>
          <Toggle
            label={t.computerUnlockAutomatic}
            isOn={unlock.saved}
            onIsOnChange={(next) => {
              if (next !== unlock.saved) void (next ? unlock.enable() : unlock.disable());
            }}
            modifiers={[
              accessibilityIdentifier('computer-auto-unlock'),
              disabled(unlock.busy || (!unlock.saved && !unlock.setupAllowed)),
            ]}
          />
        </Host>
        <Text tone="muted">
          {unlock.locked && !unlock.saved
            ? t.computerUnlockSetupUnlocked
            : t.computerUnlockExplanation}
        </Text>
        {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
        {unlock.unlockAllowed ? (
          <Button
            label={t.computerUnlockManual}
            testID="computer-unlock-manual"
            busy={unlock.busy}
            onPress={() => void unlock.manual()}
          />
        ) : null}
        <Button label={t.close} testID="computer-security-close" onPress={unlock.closeSecurity} />
      </ScrollView>
    </SheetFrame>
  );
}
