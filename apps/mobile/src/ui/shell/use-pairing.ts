import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform } from 'react-native';

import { hostSession } from '../../host/host-session';
import { nativeCarrier } from '../../host/native-carrier';
import { connectAccount } from '../../host/native-connect-account';
import { hostLooks } from '../../host/native-host-look';
import { pairHost, type PairingFailure } from '../../host/pairing';
import { mobileTelemetry } from '../../telemetry/native';
import type { PairingMethod } from '../../telemetry/schema';
import { hostLookName, withHostName } from '../design/host-look';
import { clearsPastedLink } from '../pairing-failure';

function deviceName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

export function usePairing() {
  const router = useRouter();
  const [connectionName, setConnectionName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PairingFailure | undefined>();
  const lastMethod = useRef<PairingMethod>('paste');
  const pending = useRef<AbortController | undefined>(undefined);
  const handled = useRef<string | undefined>(undefined);
  const accountHostId = useRef<string | undefined>(undefined);

  const pair = async (
    text: string,
    method: PairingMethod,
    retry = false,
    hostId?: string,
  ): Promise<PairingFailure | undefined> => {
    if (pending.current !== undefined || (!retry && method === 'qr' && handled.current === text))
      return undefined;
    handled.current = text;
    accountHostId.current = hostId;
    lastMethod.current = method;
    const operation = new AbortController();
    pending.current = operation;
    setBusy(true);
    setError(undefined);
    const result = await pairHost({
      text:
        hostId === undefined
          ? text
          : async () => {
              const offer = await connectAccount.offer(hostId, deviceName());
              return offer.ok ? { ok: true, payload: offer.value } : offer;
            },
      method,
      deviceName: deviceName(),
      carrier: nativeCarrier(),
      save: async (host) => {
        await hostSession.pair(host);
        const name = hostLookName(connectionName);
        if (name) hostLooks.set(host.hostId, withHostName(hostLooks.look(host.hostId), name));
      },
      telemetry: mobileTelemetry,
      signal: operation.signal,
    });
    pending.current = undefined;
    setBusy(false);
    if (operation.signal.aborted) return undefined;
    if (!result.ok) {
      if (clearsPastedLink(result.code, method)) handled.current = undefined;
      setError(result.code);
      return result.code;
    }
    router.dismissTo('/');
    return undefined;
  };

  return {
    busy,
    error,
    method: lastMethod.current,
    connectionName,
    setConnectionName,
    pair,
    canRetry: error !== undefined && handled.current !== undefined,
    retry: () => pair(handled.current!, lastMethod.current, true, accountHostId.current),
    forget: () => {
      handled.current = undefined;
    },
    abort: () => pending.current?.abort(),
  };
}
